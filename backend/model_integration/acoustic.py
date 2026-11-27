"""Inference for the organizer's Challenge 05 acoustic ONNX contract.

The trained graph expects an organizer-compatible 224x224 RGB log-Mel PNG.
The published pack does not specify a reproducible WAV-to-PNG recipe, so raw
WAV is deliberately not accepted as model input by this adapter.
"""

import hashlib
import io
import math
from pathlib import Path
from threading import RLock
from time import perf_counter

import numpy as np

from .dataset import SOUND_CLASSES

MAX_PNG_BYTES = 2 * 1024 * 1024


class ModelUnavailable(RuntimeError):
    pass


class InvalidModelInput(ValueError):
    pass


def _threshold(value: object) -> float:
    if isinstance(value, bool):
        raise InvalidModelInput("Wake threshold must be a finite number in [0, 1]")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise InvalidModelInput("Wake threshold must be a finite number in [0, 1]") from exc
    if not math.isfinite(number) or not 0 <= number <= 1:
        raise InvalidModelInput("Wake threshold must be a finite number in [0, 1]")
    return number


def preprocess_png(png: bytes) -> np.ndarray:
    if not png or len(png) > MAX_PNG_BYTES:
        raise InvalidModelInput("PNG must contain 1 byte to 2 MiB")
    from PIL import Image, UnidentifiedImageError
    try:
        with Image.open(io.BytesIO(png)) as image:
            if image.format != "PNG" or image.size != (224, 224):
                raise InvalidModelInput("Expected a 224x224 PNG spectrogram")
            image.load()
            rgb = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
    except (UnidentifiedImageError, OSError) as exc:
        raise InvalidModelInput("Invalid PNG image") from exc
    return np.ascontiguousarray(np.transpose(rgb, (2, 0, 1))[None, ...])


def format_prediction(wake_value: float, class_logits: np.ndarray, *, threshold: float,
                      model_kind: str, model_sha256: str, inference_ms: float,
                      source: str, inference_scope: str) -> dict:
    wake = np.asarray(wake_value, dtype=np.float64)
    logits = np.asarray(class_logits, dtype=np.float64)
    if wake.size != 1 or logits.shape != (4,) or not np.isfinite(wake).all() or not np.isfinite(logits).all():
        raise ModelUnavailable("Acoustic model outputs have invalid shape or values")
    wake_probability = float(1 / (1 + np.exp(-np.clip(wake.item(), -40, 40))))
    shifted = logits - max(logits)
    exp = np.exp(shifted)
    scores = exp / exp.sum()
    class_index = int(np.argmax(scores))
    return {
        "source": source,
        "model_kind": model_kind,
        "model_sha256": model_sha256,
        "wake_probability": round(wake_probability, 6),
        "wake_threshold": threshold,
        "wake_triggered": wake_probability >= threshold,
        "sound_class": SOUND_CLASSES[class_index],
        "sound_class_scores": {name: round(float(scores[i]), 6) for i, name in enumerate(SOUND_CLASSES)},
        "inference_ms": round(inference_ms, 3),
        "inference_scope": inference_scope,
    }


class AcousticModel:
    """Lazy CPU ONNX session with output-contract and checksum validation."""

    def __init__(self, path: Path, *, wake_threshold: float | None = None,
                 expected_sha256: str | None = None, session_factory=None):
        self.path = Path(path)
        self.wake_threshold_override = None if wake_threshold is None else _threshold(wake_threshold)
        self.expected_sha256 = expected_sha256.lower() if expected_sha256 else None
        if self.expected_sha256 and (len(self.expected_sha256) != 64 or any(c not in "0123456789abcdef" for c in self.expected_sha256)):
            raise InvalidModelInput("Model SHA256 must contain 64 hexadecimal characters")
        self._session_factory = session_factory
        self._session = None
        self._threshold = None
        self._sha256 = None
        self._lock = RLock()

    def status(self) -> dict:
        return {
            "configured": bool(str(self.path)) and self.path.is_file(),
            "loaded": self._session is not None,
            "model_kind": "challenge05_acoustic_onnx",
            "input": "224x224 RGB log-Mel PNG, [1,3,224,224] float32 [0,1]",
            "threshold_source": "override" if self.wake_threshold_override is not None else "onnx_metadata",
            "sha256": self._sha256,
        }

    def load(self) -> None:
        with self._lock:
            if self._session is not None:
                return
            if not self.path.is_file() or self.path.suffix.lower() != ".onnx":
                raise ModelUnavailable("Acoustic ONNX model is not configured or missing")
            with self.path.open("rb") as model_file:
                digest = hashlib.file_digest(model_file, "sha256").hexdigest()
            if self.expected_sha256 and digest != self.expected_sha256:
                raise ModelUnavailable("Acoustic ONNX checksum mismatch")
            factory = self._session_factory
            if factory is None:
                try:
                    import onnxruntime as ort
                except ImportError as exc:
                    raise ModelUnavailable("Install onnxruntime to run the acoustic model") from exc
                factory = lambda path: ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
            try:
                session = factory(self.path)
                inputs = session.get_inputs()
                outputs = {item.name for item in session.get_outputs()}
                if len(inputs) != 1 or list(inputs[0].shape) != [1, 3, 224, 224] or inputs[0].type != "tensor(float)":
                    raise ModelUnavailable("Unexpected acoustic ONNX input contract")
                if not {"wake_logit", "sound_class_logits"} <= outputs:
                    raise ModelUnavailable("Acoustic ONNX output names are incompatible")
                metadata = session.get_modelmeta().custom_metadata_map or {}
                raw_threshold = self.wake_threshold_override if self.wake_threshold_override is not None else metadata.get("wake_threshold")
                if raw_threshold is None:
                    raise ModelUnavailable("ONNX wake_threshold metadata missing; configure a validation-tuned override")
                threshold = _threshold(raw_threshold)
            except ModelUnavailable:
                raise
            except Exception as exc:
                raise ModelUnavailable("Could not load a compatible acoustic ONNX model") from exc
            self._session = session
            self._threshold = threshold
            self._sha256 = digest

    def predict_png(self, png: bytes, *, source: str = "submitted") -> dict:
        tensor = preprocess_png(png)
        self.load()
        with self._lock:
            started = perf_counter()
            try:
                values = self._session.run(["wake_logit", "sound_class_logits"],
                                           {self._session.get_inputs()[0].name: tensor})
            except Exception as exc:
                raise ModelUnavailable("Acoustic ONNX inference failed") from exc
            inference_ms = (perf_counter() - started) * 1000
        wake = np.asarray(values[0], dtype=np.float64)
        logits = np.asarray(values[1], dtype=np.float64)
        if wake.size != 1 or logits.shape != (1, 4):
            raise ModelUnavailable("Acoustic ONNX outputs have invalid shape")
        return format_prediction(wake.item(), logits[0], threshold=self._threshold,
                                 model_kind="challenge05_acoustic_onnx", model_sha256=self._sha256,
                                 inference_ms=inference_ms, source=source,
                                 inference_scope="onnx_runtime_only")
