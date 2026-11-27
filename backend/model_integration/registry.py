"""Select an acoustic adapter from a trusted model path and explicit settings."""

from pathlib import Path

from .acoustic import AcousticModel, InvalidModelInput
from .torch_acoustic import TorchAcousticModel


def acoustic_model_from_path(path: Path, *, wake_threshold: float | None = None,
                             architecture: str = "mobilenet_v3_small",
                             expected_sha256: str | None = None):
    suffix = Path(path).suffix.lower()
    if suffix == ".onnx":
        return AcousticModel(path, wake_threshold=wake_threshold, expected_sha256=expected_sha256)
    if suffix in {".pt", ".pth"}:
        return TorchAcousticModel(path, wake_threshold=wake_threshold,
                                  architecture=architecture, expected_sha256=expected_sha256)
    raise InvalidModelInput("Acoustic model must be .onnx, .pt, or .pth")
