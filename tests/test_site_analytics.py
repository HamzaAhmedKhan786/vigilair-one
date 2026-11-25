from pathlib import Path

from backend import main
from backend.replay import load_scenario
from backend.tracker import TrackStore


def test_forecast_excludes_observations_in_a_different_site_frame(monkeypatch):
    store = TrackStore()
    monkeypatch.setattr(main, "store", store)
    observations = [
        item for item in load_scenario(Path("data/scenario.json"))
        if item.track_id == "VIG-042"
    ]
    for item in observations:
        store.add(item)
    store.add(observations[-1].model_copy(update={
        "site_id": "other-site", "site_position_m": [10000, 10000, 20],
    }))

    result = main.track_analytics("VIG-042", observations[-1].site_id)
    assert result["forecast_anchor"] == observations[-1]
    assert result["metric_observation_count"] == len(observations)
    assert result["path_length_m"] < 200
