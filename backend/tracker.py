from collections import defaultdict
from threading import RLock
from .schemas import Observation

class TrackStore:
    def __init__(self) -> None:
        self._tracks: dict[str, list[Observation]] = defaultdict(list)
        self._lock = RLock()

    def add(self, observation: Observation) -> list[Observation]:
        with self._lock:
            self._tracks[observation.track_id].append(observation)
            return list(self._tracks[observation.track_id])

    def get(self, track_id: str) -> list[Observation]:
        with self._lock: return list(self._tracks.get(track_id, []))

    def all(self) -> dict[str, list[Observation]]:
        with self._lock: return {track_id:list(values) for track_id,values in self._tracks.items()}

    def clear(self) -> None:
        with self._lock: self._tracks.clear()
