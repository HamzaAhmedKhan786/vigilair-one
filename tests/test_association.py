from backend.association import is_same_track
from backend.replay import load_scenario
from pathlib import Path

def test_cross_camera_association_candidate():
    observations = [o for o in load_scenario(Path("data/scenario.json")) if o.track_id == "VIG-042"]
    assert not is_same_track(observations[0],observations[1],max_gap_s=10)
