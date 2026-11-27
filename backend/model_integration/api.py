"""Read-only model inference endpoints; predictions never actuate equipment."""

from functools import lru_cache

from fastapi import APIRouter, HTTPException, Request

from backend.config import get_settings
from .acoustic import InvalidModelInput, MAX_PNG_BYTES, ModelUnavailable
from .dataset import Challenge05Dataset, DatasetError
from .registry import acoustic_model_from_path
from .visual import MAX_IMAGE_BYTES, RFDETRNanoModel

router = APIRouter(prefix="/api/models/acoustic", tags=["acoustic-model"])
visual_router = APIRouter(prefix="/api/models/visual", tags=["visual-model"])


@lru_cache(maxsize=1)
def configured_model():
    settings = get_settings()
    path = settings.acoustic_model_path or settings.acoustic_onnx_path
    if not path:
        return None
    return acoustic_model_from_path(settings.resolve(path),
                                    wake_threshold=settings.acoustic_wake_threshold,
                                    architecture=settings.acoustic_architecture,
                                    expected_sha256=settings.acoustic_onnx_sha256)


@router.get("/status")
def model_status():
    model = configured_model()
    if model is None:
        return {"configured": False, "loaded": False, "model_kind": "challenge05_acoustic"}
    return model.status()


@router.get("/dataset")
def dataset_status():
    root = get_settings().challenge05_dataset_dir
    if not root:
        raise HTTPException(503, "Challenge 05 dataset directory is not configured")
    try:
        return Challenge05Dataset(get_settings().resolve(root)).audit()
    except DatasetError as exc:
        raise HTTPException(503, str(exc)) from exc


@router.post("/predict")
async def predict(request: Request):
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "image/png":
        raise HTTPException(415, "Send a 224x224 log-Mel PNG with Content-Type: image/png")
    model = configured_model()
    if model is None:
        raise HTTPException(503, "Acoustic model is not configured")
    payload = bytearray()
    async for chunk in request.stream():
        payload.extend(chunk)
        if len(payload) > MAX_PNG_BYTES:
            raise HTTPException(413, "PNG exceeds 2 MiB")
    try:
        return model.predict_png(bytes(payload), source="submitted_png")
    except InvalidModelInput as exc:
        raise HTTPException(422, str(exc)) from exc
    except ModelUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc


@lru_cache(maxsize=1)
def configured_visual_model() -> RFDETRNanoModel | None:
    settings = get_settings()
    if not settings.rfdetr_onnx_path or not settings.rfdetr_class_names:
        return None
    return RFDETRNanoModel(settings.resolve(settings.rfdetr_onnx_path),
                           tuple(settings.rfdetr_class_names.split(",")),
                           expected_sha256=settings.rfdetr_onnx_sha256)


@visual_router.get("/status")
def visual_status():
    model = configured_visual_model()
    if model is None:
        return {"configured": False, "loaded": False, "model_kind": "rfdetr_nano_full_onnx"}
    return model.status()


@visual_router.post("/predict")
async def visual_predict(request: Request):
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type not in {"image/png", "image/jpeg"}:
        raise HTTPException(415, "Send PNG or JPEG frame bytes")
    model = configured_visual_model()
    if model is None:
        raise HTTPException(503, "RF-DETR Nano full ONNX model and class map are not configured")
    payload = bytearray()
    async for chunk in request.stream():
        payload.extend(chunk)
        if len(payload) > MAX_IMAGE_BYTES:
            raise HTTPException(413, "Image exceeds 4 MiB")
    try:
        return model.predict_image(bytes(payload), source="submitted_frame")
    except InvalidModelInput as exc:
        raise HTTPException(422, str(exc)) from exc
    except ModelUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
