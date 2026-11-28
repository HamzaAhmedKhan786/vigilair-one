import hashlib
import io
import json
import wave

from fastapi.testclient import TestClient

from backend.main import app
from backend.research.media import MediaStore, wav_visualization
from backend.research.registry import PackageRegistry
from backend.research.scenario import scenario


def make_wav(frames=80000):
    stream = io.BytesIO()
    with wave.open(stream, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(16000)
        audio.writeframes(b"\x00\x00" * frames)
    return stream.getvalue()


def test_fictional_grid_and_independent_truth():
    from backend.config import ROOT
    result = scenario(ROOT / "data" / "research_sites.json")
    assert len(result["sites"]) == 28
    assert len(result["default_visible"]) == 4
    assert len(result["zones"]["features"]) == 28
    assert len({row["site_id"] for row in result["observations"]}) >= 3
    assert result["validation"]["sample_count"] == 30
    assert result["validation"]["distance_mae_m"] < 5
    assert result["observations"][1]["speed_mps"] < 50
    assert [event["kind"] for event in result["activation_events"]] == [
        "simulated_acoustic_cue", "simulated_visual_review", "simulated_zone_transition"]


def test_registry_requires_contract_checksum_and_manual_refresh(tmp_path):
    package_dir = tmp_path / "demo"
    package_dir.mkdir()
    manifest = {"schema_version": 1, "packages": [{
        "id": "demo", "name": "Demo", "version": "1.0.0", "family": "mobilenetv3_small",
        "artifacts": [{"role": "acoustic", "path": "demo/model.onnx", "format": "onnx", "sha256": None}],
        "preprocessing": {"input_media": "log_mel_png"}, "classes": ["drone_buzz"],
        "inputs": {"acoustic": "tensor"}, "outputs": {"acoustic": ["wake_logit"]},
        "provenance": {"training_source": "test fixture", "dataset_version": "fixture", "license": "test"},
    }]}
    (tmp_path / "registry.json").write_text(json.dumps(manifest))
    registry = PackageRegistry(tmp_path)
    assert registry.snapshot()["packages"][0]["status"] == "missing"
    model = package_dir / "model.onnx"
    model.write_bytes(b"test artifact bytes")
    manifest["packages"][0]["artifacts"][0]["sha256"] = hashlib.sha256(model.read_bytes()).hexdigest()
    (tmp_path / "registry.json").write_text(json.dumps(manifest))
    assert registry.snapshot()["packages"][0]["status"] == "missing"
    assert registry.refresh()["packages"][0]["status"] == "package_complete_unverified"
    model.write_bytes(b"changed")
    assert registry.refresh()["packages"][0]["status"] == "incompatible"


def test_media_api_preserves_original_and_separates_annotations(tmp_path, monkeypatch):
    from backend.research import api
    store = MediaStore(tmp_path / "media.db", tmp_path / "originals")
    store.seed_sensors(["FIC-01"])
    monkeypatch.setattr(api, "media", store)
    client = TestClient(app)
    original = make_wav()
    response = client.post("/api/research/media?filename=clip.wav&site_id=FIC-01&sensor_id=FIC-01-MIC",
                           content=original, headers={"Content-Type": "application/octet-stream"})
    assert response.status_code == 200, response.text
    item = response.json()
    assert item["metadata"]["challenge05_compatible"] is True
    assert item["sha256"] == hashlib.sha256(original).hexdigest()
    from backend.research.media import MediaError
    import pytest
    with pytest.raises(MediaError):
        store.save(b"not audio", original_name="bad.wav", site_id="FIC-01", sensor_id="FIC-01-MIC")
    assert client.post("/api/research/media?filename=bad.wav&site_id=FIC-01&sensor_id=FIC-01-MIC",
                       content=b"not audio").status_code == 422
    assert client.post("/api/research/media?filename=bad.exe&site_id=FIC-01&sensor_id=FIC-01-MIC",
                       content=b"bad").status_code == 415
    assert client.get(f"/api/research/media/{item['id']}/content").content == original
    annotation = client.post(f"/api/research/media/{item['id']}/annotations",
                             json={"label": "uncertain", "reviewer": "tester", "note": "Source unclear"})
    assert annotation.status_code == 200
    detail = client.get(f"/api/research/media/{item['id']}").json()
    assert detail["annotations"][0]["label"] == "uncertain"
    assert detail["sha256"] == item["sha256"]
    assert client.post(f"/api/research/media/{item['id']}/annotations",
                       json={"label": "unknown", "reviewer": "tester"}).status_code == 422
    plot = client.get(f"/api/research/media/{item['id']}/visualization")
    assert plot.status_code == 200
    assert len(plot.json()["waveform_rms"]) == 128
    assert len(plot.json()["log_mel_db"]) == 64


def test_virtual_sensor_site_boundary(tmp_path, monkeypatch):
    from backend.research import api
    store = MediaStore(tmp_path / "sensors.db", tmp_path / "originals")
    monkeypatch.setattr(api, "media", store)
    client = TestClient(app)
    assert client.post("/api/research/sensors", json={"site_id": "REAL-SITE", "name": "Bad", "kind": "camera"}).status_code == 422
    created = client.post("/api/research/sensors", json={"site_id": "FIC-02", "name": "Virtual camera", "kind": "camera"})
    assert created.status_code == 200
    assert client.delete(f"/api/research/sensors/{created.json()['id']}").status_code == 200
