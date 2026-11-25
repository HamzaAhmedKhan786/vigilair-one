import pytest
from pydantic import ValidationError

from backend.hybrid_replay import FIXTURE, Window, evaluate, load_replay, spike_times
from backend.main import hybrid_replay


def test_spiking_model_responds_to_bursts_and_ignores_sparse_activity():
    assert spike_times([1, 2, 3, 4, 5, 6, 14, 15, 16]) == [3, 16]
    assert spike_times([10, 55, 120, 210]) == []


def test_hybrid_never_turns_temporal_activity_into_an_object_label():
    report = evaluate(load_replay(FIXTURE))
    windows = {window["window_id"]: window for window in report["windows"]}
    assert windows["sim-drone-motion"]["outcome"] == "vision_with_temporal_support"
    assert windows["sim-bird-motion"]["vision_label"] == "bird"
    assert windows["sim-bird-motion"]["outcome"] == "vision_with_temporal_support"
    assert windows["sim-sparse-motion-miss"]["outcome"] == "vision_only"
    assert windows["sim-sparse-motion-miss"]["expected_activity"] is True
    assert windows["sim-motion-without-label"]["outcome"] == "activity_only"
    assert windows["sim-motion-without-label"]["vision_label"] is None


def test_experiment_endpoint_reports_fixture_provenance():
    report = hybrid_replay()
    assert report["event_input"] == "simulated_events"
    assert report["vision_input"] == "synthetic_labels"
    assert report["labeled_windows"] == report["window_count"] == 5
    assert report["activity_accuracy"] == .8


def test_out_of_order_events_are_rejected():
    with pytest.raises(ValidationError, match="chronological"):
        Window(window_id="bad-window", event_times_ms=[50, 3])
