from collections import defaultdict
from threading import RLock
from .schemas import GlobalTrackObservation

class GlobalTrackStore:
    def __init__(self): self._tracks: dict[str,list[GlobalTrackObservation]]=defaultdict(list); self._lock=RLock()
    def add(self, observation: GlobalTrackObservation) -> list[GlobalTrackObservation]:
        with self._lock:
            values=self._tracks[observation.global_track_id]
            if values and observation.timestamp < values[-1].timestamp: raise ValueError("global track observations must be chronological")
            values.append(observation); return list(values)
    def get(self, global_track_id: str) -> list[GlobalTrackObservation]:
        with self._lock: return list(self._tracks.get(global_track_id,[]))
    def summaries(self) -> list[dict]:
        with self._lock:
            return [{"global_track_id":key,"observation_count":len(values),"sites":sorted({item.site_id for item in values}),"latest":values[-1]} for key,values in self._tracks.items() if values]
    def clear(self) -> None:
        with self._lock: self._tracks.clear()
