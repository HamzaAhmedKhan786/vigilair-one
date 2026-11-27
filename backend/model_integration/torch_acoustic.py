"""CPU inference for the organizer's pure-state-dict acoustic .pt checkpoint.

Only the starter-kit architecture is reconstructed. No arbitrary Python object
or custom class is deserialized from the checkpoint.
"""

import hashlib
from pathlib import Path
from threading import RLock
from time import perf_counter

from .acoustic import InvalidModelInput, ModelUnavailable, _threshold, format_prediction, preprocess_png


class TorchAcousticModel:
    def __init__(self, path: Path, *, wake_threshold: float | None,
                 architecture: str = "mobilenet_v3_small", expected_sha256: str | None = None):
        self.path = Path(path)
        if architecture not in {"mobilenet_v3_small", "resnet18"}:
            raise InvalidModelInput("Unsupported acoustic PyTorch architecture")
        self.architecture = architecture
        self.wake_threshold = None if wake_threshold is None else _threshold(wake_threshold)
        self.expected_sha256 = expected_sha256.lower() if expected_sha256 else None
        if self.expected_sha256 and (len(self.expected_sha256) != 64 or any(c not in "0123456789abcdef" for c in self.expected_sha256)):
            raise InvalidModelInput("Model SHA256 must contain 64 hexadecimal characters")
        self._model = None
        self._sha256 = None
        self._lock = RLock()

    def status(self) -> dict:
        return {"configured": self.path.is_file(), "loaded": self._model is not None,
                "model_kind": "challenge05_acoustic_pytorch_state_dict",
                "architecture": self.architecture, "threshold_source": "override_required",
                "sha256": self._sha256}

    def load(self) -> None:
        with self._lock:
            if self._model is not None:
                return
            if not self.path.is_file() or self.path.suffix.lower() not in {".pt", ".pth"}:
                raise ModelUnavailable("Acoustic PyTorch state-dict file is missing")
            if self.wake_threshold is None:
                raise ModelUnavailable("The .pt state dict does not store a threshold; set a validation-tuned wake threshold")
            with self.path.open("rb") as model_file:
                digest = hashlib.file_digest(model_file, "sha256").hexdigest()
            if self.expected_sha256 and digest != self.expected_sha256:
                raise ModelUnavailable("Acoustic PyTorch checkpoint checksum mismatch")
            try:
                import torch
                from torch import nn
                from torchvision import models
            except ImportError as exc:
                raise ModelUnavailable("Install torch and torchvision to run .pt acoustic checkpoints") from exc
            try:
                if self.architecture == "resnet18":
                    backbone = models.resnet18(weights=None)
                    feat_dim = backbone.fc.in_features
                    backbone.fc = nn.Identity()
                else:
                    backbone = models.mobilenet_v3_small(weights=None)
                    feat_dim = backbone.classifier[0].in_features
                    backbone.classifier = nn.Identity()

                class StarterAcousticCNN(nn.Module):
                    def __init__(self):
                        super().__init__()
                        self.register_buffer("mean", torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1))
                        self.register_buffer("std", torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1))
                        self.backbone = backbone
                        self.head_wake = nn.Linear(feat_dim, 1)
                        self.head_class = nn.Linear(feat_dim, 4)

                    def forward(self, x):
                        features = self.backbone((x - self.mean) / self.std)
                        return self.head_wake(features).squeeze(-1), self.head_class(features)

                # weights_only=True prevents loading arbitrary checkpoint Python objects.
                state = torch.load(self.path, map_location="cpu", weights_only=True)
                if not isinstance(state, dict) or not state or not all(isinstance(key, str) and isinstance(value, torch.Tensor) for key, value in state.items()):
                    raise ModelUnavailable("Expected the starter kit's plain tensor state_dict")
                model = StarterAcousticCNN()
                model.load_state_dict(state, strict=True)
                model.eval()
            except ModelUnavailable:
                raise
            except Exception as exc:
                raise ModelUnavailable("PyTorch checkpoint is not compatible with the organizer acoustic architecture") from exc
            self._model = model
            self._sha256 = digest

    def predict_png(self, png: bytes, *, source: str = "submitted") -> dict:
        array = preprocess_png(png)
        self.load()
        import torch
        with self._lock, torch.inference_mode():
            started = perf_counter()
            try:
                wake, classes = self._model(torch.from_numpy(array))
            except Exception as exc:
                raise ModelUnavailable("Acoustic PyTorch inference failed") from exc
            inference_ms = (perf_counter() - started) * 1000
        return format_prediction(float(wake.item()), classes.detach().cpu().numpy()[0],
                                 threshold=self.wake_threshold, model_kind="challenge05_acoustic_pytorch_state_dict",
                                 model_sha256=self._sha256, inference_ms=inference_ms,
                                 source=source, inference_scope="pytorch_forward_only")
