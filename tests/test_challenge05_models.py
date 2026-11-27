import hashlib
import io
import json
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from backend.main import app
from backend.model_integration.acoustic import AcousticModel, InvalidModelInput, ModelUnavailable, preprocess_png
from backend.model_integration.dataset import Challenge05Dataset, DatasetError
from backend.model_integration.registry import acoustic_model_from_path
from backend.model_integration.torch_acoustic import TorchAcousticModel
from backend.model_integration.visual import RFDETRNanoModel


def png_bytes():
    buffer = io.BytesIO()
    Image.new("RGB", (224, 224), (32, 64, 128)).save(buffer, format="PNG")
    return buffer.getvalue()


class FakeSession:
    def get_inputs(self):
        return [SimpleNamespace(name="spectrogram", shape=[1, 3, 224, 224], type="tensor(float)")]

    def get_outputs(self):
        return [SimpleNamespace(name="wake_logit"), SimpleNamespace(name="sound_class_logits")]

    def get_modelmeta(self):
        return SimpleNamespace(custom_metadata_map={"wake_threshold": "0.75"})

    def run(self, names, values):
        assert names == ["wake_logit", "sound_class_logits"]
        assert values["spectrogram"].shape == (1, 3, 224, 224)
        assert values["spectrogram"].dtype == np.float32
        return [np.array([2.0]), np.array([[4.0, 1.0, 0.0, -1.0]])]


class FakeVisualSession:
    def get_inputs(self):
        return [SimpleNamespace(name="image", shape=[1, 3, 384, 384], type="tensor(float)")]

    def get_outputs(self):
        return [SimpleNamespace(name="dets"), SimpleNamespace(name="labels")]

    def run(self, names, values):
        assert names == ["dets", "labels"]
        assert values["image"].shape == (1, 3, 384, 384)
        return [np.array([[[0.5, 0.5, 0.2, 0.2]]]), np.array([[[5.0, -5.0, -10.0]]])]


def model(tmp_path):
    path = tmp_path / "trusted.onnx"
    path.write_bytes(b"fake for injected session")
    sha = hashlib.sha256(path.read_bytes()).hexdigest()
    return AcousticModel(path, expected_sha256=sha, session_factory=lambda _: FakeSession())


def test_acoustic_output_contract_and_threshold(tmp_path):
    result = model(tmp_path).predict_png(png_bytes(), source="test_fixture")
    assert result["wake_triggered"] is True
    assert result["wake_probability"] == pytest.approx(0.880797, abs=1e-6)
    assert result["sound_class"] == "drone_buzz"
    assert sum(result["sound_class_scores"].values()) == pytest.approx(1, abs=2e-6)
    assert result["source"] == "test_fixture"


def test_reject_incompatible_or_oversized_input(tmp_path):
    with pytest.raises(InvalidModelInput):
        preprocess_png(b"not a png")
    with pytest.raises(InvalidModelInput):
        preprocess_png(b"x" * (2 * 1024 * 1024 + 1))
    with pytest.raises(InvalidModelInput):
        AcousticModel(tmp_path / "x.onnx", wake_threshold=float("nan"))


def test_reject_wrong_model_checksum(tmp_path):
    path = tmp_path / "wrong.onnx"
    path.write_bytes(b"changed model")
    instance = AcousticModel(path, expected_sha256="0" * 64,
                             session_factory=lambda _: FakeSession())
    with pytest.raises(ModelUnavailable, match="checksum"):
        instance.predict_png(png_bytes())


def test_model_registry_accepts_known_formats_and_requires_pt_threshold(tmp_path):
    assert isinstance(acoustic_model_from_path(tmp_path / "m.onnx"), AcousticModel)
    instance = acoustic_model_from_path(tmp_path / "m.pt")
    assert isinstance(instance, TorchAcousticModel)
    with pytest.raises(ModelUnavailable, match="missing"):
        instance.predict_png(png_bytes())
    with pytest.raises(InvalidModelInput):
        acoustic_model_from_path(tmp_path / "m.pkl")


def test_optional_visual_output_contract(tmp_path):
    path = tmp_path / "visual.onnx"
    path.write_bytes(b"fake for injected session")
    model = RFDETRNanoModel(path, ("drone", "bird"),
                            session_factory=lambda _: FakeVisualSession())
    result = model.predict_image(png_bytes())
    assert result["detections"][0]["class_name"] == "drone"
    assert result["detections"][0]["bbox_xyxy"] == [89.6, 89.6, 134.4, 134.4]
    with pytest.raises(InvalidModelInput):
        RFDETRNanoModel(path, ())


def test_dataset_public_labels_and_held_out_split(tmp_path):
    root = tmp_path / "pack"
    (root / "dataset" / "train").mkdir(parents=True)
    (root / "dataset" / "test").mkdir()
    (root / "dataset" / "dataset_card.json").write_text("{}")
    for split in ("train", "test"):
        (root / "audio" / split).mkdir(parents=True)
        (root / "spectrograms" / split).mkdir(parents=True)
        (root / "audio" / split / "c5_0001.wav").write_bytes(b"wav")
        (root / "spectrograms" / split / "c5_0001.png").write_bytes(png_bytes())
        row = {"id": "c5_0001", "split": split,
               "audio": f"audio/{split}/c5_0001.wav",
               "spectrogram": f"spectrograms/{split}/c5_0001.png", "video": None}
        if split == "train":
            row.update(sound_class="drone_buzz", has_drone_audio=True)
        (root / "dataset" / split / "labels.jsonl").write_text(json.dumps(row) + "\n")
    dataset = Challenge05Dataset(root)
    assert dataset.rows("train")[0]["sound_class"] == "drone_buzz"
    assert "sound_class" not in dataset.rows("test")[0]
    with pytest.raises(DatasetError):
        dataset.clip("train", "../bad")
    test_manifest = root / "dataset" / "test" / "labels.jsonl"
    test_manifest.write_text(test_manifest.read_text().strip()[:-1] + ', "sound_class": "drone_buzz"}\n')
    with pytest.raises(DatasetError, match="test labels"):
        dataset.rows("test")


def test_api_png_inference_and_content_type(tmp_path, monkeypatch):
    from backend.model_integration import api
    monkeypatch.setattr(api, "configured_model", lambda: model(tmp_path))
    client = TestClient(app)
    response = client.post("/api/models/acoustic/predict", content=png_bytes(),
                           headers={"content-type": "image/png"})
    assert response.status_code == 200
    assert response.json()["source"] == "submitted_png"
    assert client.post("/api/models/acoustic/predict", content=b"x",
                       headers={"content-type": "audio/wav"}).status_code == 415
    assert client.post("/api/models/acoustic/predict", content=b"x",
                       headers={"content-type": "image/png"}).status_code == 422


def test_visual_api_requires_model_and_accepts_frame(tmp_path, monkeypatch):
    from backend.model_integration import api
    client = TestClient(app)
    monkeypatch.setattr(api, "configured_visual_model", lambda: None)
    assert client.post("/api/models/visual/predict", content=png_bytes(),
                       headers={"content-type": "image/png"}).status_code == 503
    path = tmp_path / "visual.onnx"
    path.write_bytes(b"fake for injected session")
    monkeypatch.setattr(api, "configured_visual_model",
                        lambda: RFDETRNanoModel(path, ("drone", "bird"),
                                                 session_factory=lambda _: FakeVisualSession()))
    response = client.post("/api/models/visual/predict", content=png_bytes(),
                           headers={"content-type": "image/png"})
    assert response.status_code == 200
    assert response.json()["detections"][0]["class_name"] == "drone"
