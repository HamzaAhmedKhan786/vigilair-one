from backend.geospatial import evaluate_handoff, haversine_m
from backend.schemas import GeoPoint, HandoffRequest

def test_haversine_and_handoff_are_bounded():
    a=GeoPoint(latitude=52.3667,longitude=13.5033,altitude_m=70); b=GeoPoint(latitude=52.3668,longitude=13.5040,altitude_m=72)
    assert 40 < haversine_m(a,b) < 60
    result=evaluate_handoff(HandoffRequest(track_id="T",from_site_id="A",to_site_id="B",last_position=a,candidate_position=b,elapsed_seconds=10,max_speed_mps=20,appearance_similarity=.8))
    assert result["handoff_feasible"] is True
    assert 0 <= result["association_confidence"] <= 1
