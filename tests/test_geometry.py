from backend.geometry import analyze_track
from backend.replay import load_scenario
from pathlib import Path

def test_metric_path_and_zone_distance():
    observations = [o for o in load_scenario(Path("data/scenario.json")) if o.track_id == "VIG-042"]
    result = analyze_track(observations,(120,60,180,120))
    assert result.path_length_m > result.displacement_m
    assert result.distance_to_restricted_zone_m >= 0
    assert len(result.predicted_path_m) == 6
