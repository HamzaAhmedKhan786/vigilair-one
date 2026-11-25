from datetime import datetime, timezone, timedelta
from backend.multisite import GlobalTrackStore
from backend.schemas import GeoPoint, GlobalTrackObservation

def test_global_track_keeps_site_handoff_history():
    store=GlobalTrackStore(); now=datetime.now(timezone.utc)
    store.add(GlobalTrackObservation(timestamp=now,global_track_id="G-1",site_id="A",local_track_id="A-1",position=GeoPoint(latitude=52.3,longitude=13.4),classification="drone",confidence=.9))
    store.add(GlobalTrackObservation(timestamp=now+timedelta(seconds=30),global_track_id="G-1",site_id="B",local_track_id="B-2",position=GeoPoint(latitude=52.31,longitude=13.41),classification="drone",confidence=.8,handoff_status="candidate"))
    summary=store.summaries()[0]
    assert summary["sites"] == ["A","B"] and summary["observation_count"] == 2
