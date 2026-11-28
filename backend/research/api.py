"""Offline research routes; no sensor activation or physical-control endpoints."""

from pathlib import Path
from time import perf_counter

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from backend.config import get_settings
from .media import MAX_MEDIA_BYTES, MEDIA_TYPES, MediaError, MediaStore, wav_visualization
from .registry import PackageRegistry
from .scenario import scenario

settings = get_settings()
router = APIRouter(prefix="/api/research", tags=["research"])
packages = PackageRegistry(settings.resolve(settings.research_models_path))
media = MediaStore(settings.resolve(settings.research_media_db_path), settings.resolve(settings.research_media_path))
_scenario = scenario(settings.resolve(settings.research_sites_path))
media.seed_sensors(_scenario["default_visible"])


class SensorInput(BaseModel):
    site_id: str
    name: str = Field(min_length=1, max_length=80)
    kind: str


class AnnotationInput(BaseModel):
    label: str
    reviewer: str = Field(min_length=1, max_length=80)
    note: str = Field(default="", max_length=1000)


@router.get("/models")
def model_packages():
    return packages.snapshot()


@router.post("/models/refresh")
def refresh_models():
    try:
        return packages.refresh()
    except (ValueError, OSError) as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/scenario")
def fictional_scenario():
    return _scenario


@router.get("/sensors")
def list_sensors():
    return media.sensors()


@router.post("/sensors")
def create_sensor(payload: SensorInput):
    if payload.site_id not in {site["site_id"] for site in _scenario["sites"]}:
        raise HTTPException(422, "Unknown fictional site")
    try:
        return media.add_sensor(payload.site_id, payload.name, payload.kind)
    except MediaError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.delete("/sensors/{sensor_id}")
def delete_sensor(sensor_id: str):
    try:
        if not media.delete_sensor(sensor_id):
            raise HTTPException(404, "Virtual sensor not found")
        return {"deleted": sensor_id}
    except MediaError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/media")
def list_media():
    return media.list()


@router.post("/media")
async def upload_media(request: Request, filename: str, site_id: str, sensor_id: str):
    if len(filename) > 200 or Path(filename).suffix.lower().lstrip(".") not in MEDIA_TYPES:
        raise HTTPException(415, "Use WAV, MP3, MP4, WebM, JPEG or PNG")
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_MEDIA_BYTES:
        raise HTTPException(413, "Media exceeds 100 MiB")
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > MAX_MEDIA_BYTES:
            raise HTTPException(413, "Media exceeds 100 MiB")
    if len(data) > MAX_MEDIA_BYTES:
        raise HTTPException(413, "Media exceeds 100 MiB")
    started = perf_counter()
    try:
        result = await run_in_threadpool(media.save, bytes(data), original_name=filename, site_id=site_id, sensor_id=sensor_id)
    except MediaError as exc:
        raise HTTPException(422, str(exc)) from exc
    result["upload_processing_ms"] = round((perf_counter() - started) * 1000, 3)
    return result


@router.get("/media/{media_id}")
def media_detail(media_id: str):
    item = media.get(media_id)
    if not item:
        raise HTTPException(404, "Media not found")
    return {**item, "annotations": media.annotations(media_id)}


@router.get("/media/{media_id}/content")
def media_content(media_id: str):
    item = media.get(media_id)
    if not item:
        raise HTTPException(404, "Media not found")
    return FileResponse(media.path(item), media_type=MEDIA_TYPES[item["extension"]],
                        headers={"X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox"})


@router.get("/media/{media_id}/visualization")
def media_visualization(media_id: str):
    item = media.get(media_id)
    if not item:
        raise HTTPException(404, "Media not found")
    if item["extension"] != "wav":
        raise HTTPException(409, "Server spectral plots require PCM WAV; other media remain available for playback")
    try:
        return wav_visualization(media.path(item))
    except MediaError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/media/{media_id}/annotations")
def add_annotation(media_id: str, payload: AnnotationInput):
    try:
        return media.annotate(media_id, payload.label, payload.reviewer, payload.note)
    except MediaError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/health")
def research_health():
    return {"mode": "offline_research", "fictional_sites": len(_scenario["sites"]),
            "virtual_sensors": len(media.sensors()), "preserved_media": len(media.list()),
            "packages": {item["id"]: item["status"] for item in packages.snapshot()["packages"]},
            "physical_control": False}
