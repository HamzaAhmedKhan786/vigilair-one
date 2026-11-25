from copy import deepcopy
from types import SimpleNamespace

import pytest

from scripts.replay_tools import evaluate, run_yolo, validate


def bundle(source, boxes):
    return {
        "version": 1, "source": source, "video_sha256": "a" * 64,
        "weights_sha256": "b" * 64, "width": 100, "height": 100, "fps": 10,
        "frames": [{"index": 0, "offset_s": 0, "boxes": boxes}],
    }


def test_duplicate_prediction_counts_as_false_positive():
    box = {"label": "bird", "xyxy": [0, 0, 10, 10], "confidence": .9}
    result = evaluate(validate(bundle("yolo", [box, box])), validate(bundle("manual", [box])))
    assert (result["tp"], result["fp"], result["fn"], result["precision"], result["recall"]) == (1, 1, 0, .5, 1)


def test_invalid_timing_or_video_identity_is_rejected():
    prediction = bundle("yolo", [])
    shifted = deepcopy(prediction)
    shifted["frames"][0]["offset_s"] = .1
    with pytest.raises(ValueError, match="Timestamp"):
        validate(shifted)
    truth = bundle("manual", [])
    truth["video_sha256"] = "c" * 64
    with pytest.raises(ValueError, match="metadata"):
        evaluate(prediction, truth)


def test_wrong_checkpoint_digest_stops_before_loading_runtime(tmp_path):
    video = tmp_path / "clip.mp4"
    weights = tmp_path / "model.pt"
    video.touch()
    weights.write_bytes(b"untrusted checkpoint")
    with pytest.raises(ValueError, match="checksum mismatch"):
        run_yolo(SimpleNamespace(video=video, weights=weights, weights_sha256="0" * 64))


def test_snn_input_provenance_is_required_and_reported():
    prediction = bundle("snn", [])
    with pytest.raises(ValueError, match="event input source"):
        validate(prediction)
    prediction["input_kind"] = "simulated_events"
    report = evaluate(validate(prediction), validate(bundle("manual", [])))
    assert report["source"] == "snn"
    assert report["input_kind"] == "simulated_events"
    assert report["precision"] is None
