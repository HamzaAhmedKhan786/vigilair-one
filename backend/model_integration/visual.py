"""Optional full RF-DETR Nano ONNX inference on approved still frames.

This requires the complete detector export with `dets` and `labels` outputs.
The backbone-only export mentioned in the starter kit is insufficient.
"""

import hashlib
import io
import math
from pathlib import Path
from threading import RLock
from time import perf_counter

import numpy as np

from .acoustic import InvalidModelInput, ModelUnavailable

MAX_IMAGE_BYTES = 4 * 1024 * 1024
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 3, 1, 1)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 3, 1, 1)


def preprocess_image(data: bytes, size: int = 384) -> tuple[np.ndarray, tuple[int, int]]:
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise InvalidModelInput("Image must contain 1 byte to 4 MiB")
    from PIL import Image, UnidentifiedImageError
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.format not in {"PNG", "JPEG"} or image.width > 4096 or image.height > 4096:
                raise InvalidModelInput("Expected a PNG or JPEG frame no larger than 4096 x 4096")
            width, height = image.size
            rgb = image.convert("RGB").resize((size, size), Image.Resampling.BILINEAR)
            values = np.asarray(rgb, dtype=np.float32) / 255.0
    except (UnidentifiedImageError, OSError) as exc:
        raise InvalidModelInput("Invalid PNG or JPEG image") from exc
    tensor = np.transpose(values, (2, 0, 1))[None, ...]
    return np.ascontiguousarray((tensor - IMAGENET_MEAN) / IMAGENET_STD), (width, height)


class RFDETRNanoModel:
    def __init__(self, path: Path, class_names: tuple[str, ...], *, expected_sha256: str | None = None,
                 session_factory=None):
        self.path = Path(path)
        self.class_names = tuple(name.strip() for name in class_names)
        if not self.class_names or any(not name for name in self.class_names) or len(set(self.class_names)) != len(self.class_names):
            raise InvalidModelInput("An explicit, unique RF-DETR class map is required")
        self.expected_sha256 = expected_sha256.lower() if expected_sha256 else None
        if self.expected_sha256 and (len(self.expected_sha256) != 64 or any(c not in "0123456789abcdef" for c in self.expected_sha256)):
            raise InvalidModelInput("Model SHA256 must contain 64 hexadecimal characters")
        self._session_factory = session_factory
        self._session = None
        self._sha256 = None
        self._lock = RLock()

    def status(self) -> dict:
        return {"configured": self.path.is_file(), "loaded": self._session is not None,
                "model_kind": "rfdetr_nano_full_onnx", "class_names": list(self.class_names),
                "sha256": self._sha256}

    def load(self) -> None:
        with self._lock:
            if self._session is not None:
                return
            if not self.path.is_file() or self.path.suffix.lower() != ".onnx":
                raise ModelUnavailable("Full RF-DETR Nano ONNX model is not configured or missing")
            with self.path.open("rb") as model_file:
                digest = hashlib.file_digest(model_file, "sha256").hexdigest()
            if self.expected_sha256 and digest != self.expected_sha256:
                raise ModelUnavailable("RF-DETR Nano ONNX checksum mismatch")
            factory = self._session_factory
            if factory is None:
                try:
                    import onnxruntime as ort
                except ImportError as exc:
                    raise ModelUnavailable("Install onnxruntime to run RF-DETR Nano") from exc
                factory = lambda path: ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
            try:
                session = factory(self.path)
                inputs = session.get_inputs()
                outputs = {item.name for item in session.get_outputs()}
                if len(inputs) != 1 or list(inputs[0].shape) != [1, 3, 384, 384] or inputs[0].type != "tensor(float)":
                    raise ModelUnavailable("Unexpected RF-DETR Nano input contract")
                if not {"dets", "labels"} <= outputs:
                    raise ModelUnavailable("Full RF-DETR Nano outputs dets and labels are required")
            except ModelUnavailable:
                raise
            except Exception as exc:
                raise ModelUnavailable("Could not load a compatible RF-DETR Nano ONNX model") from exc
            self._session = session
            self._sha256 = digest

    def predict_image(self, data: bytes, *, confidence: float = 0.25,
                      top_k: int = 100, source: str = "submitted") -> dict:
        if not math.isfinite(confidence) or not 0 <= confidence <= 1 or not 1 <= top_k <= 1000:
            raise InvalidModelInput("Confidence or top_k is out of range")
        tensor, (width, height) = preprocess_image(data)
        self.load()
        with self._lock:
            started = perf_counter()
            try:
                values = self._session.run(["dets", "labels"],
                                           {self._session.get_inputs()[0].name: tensor})
            except Exception as exc:
                raise ModelUnavailable("RF-DETR Nano ONNX inference failed") from exc
            inference_ms = (perf_counter() - started) * 1000
        boxes, logits = (np.asarray(values[0], dtype=np.float64), np.asarray(values[1], dtype=np.float64))
        classes = len(self.class_names)
        if (boxes.ndim != 3 or boxes.shape[0] != 1 or boxes.shape[2] != 4 or
            logits.ndim != 3 or logits.shape[:2] != boxes.shape[:2] or logits.shape[2] < classes + 1 or
            not np.isfinite(boxes).all() or not np.isfinite(logits).all()):
            raise ModelUnavailable("RF-DETR Nano outputs have invalid shape or values")
        probabilities = 1 / (1 + np.exp(-np.clip(logits[0, :, :classes], -40, 40)))
        order = np.argsort(probabilities.reshape(-1))[::-1][:top_k]
        detections = []
        for flat_index in order:
            query, class_id = divmod(int(flat_index), classes)
            score = float(probabilities[query, class_id])
            if score < confidence:
                continue
            cx, cy, bw, bh = boxes[0, query]
            xyxy = [max(0.0, min(width, (cx - bw / 2) * width)),
                    max(0.0, min(height, (cy - bh / 2) * height)),
                    max(0.0, min(width, (cx + bw / 2) * width)),
                    max(0.0, min(height, (cy + bh / 2) * height))]
            if xyxy[2] <= xyxy[0] or xyxy[3] <= xyxy[1]:
                continue
            detections.append({"class_id": class_id, "class_name": self.class_names[class_id],
                               "confidence": round(score, 6),
                               "bbox_xyxy": [round(float(v), 2) for v in xyxy]})
        return {"source": source, "model_kind": "rfdetr_nano_full_onnx",
                "model_sha256": self._sha256, "frame_width": width, "frame_height": height,
                "detections": detections, "inference_ms": round(inference_ms, 3),
                "inference_scope": "onnx_runtime_only"}
