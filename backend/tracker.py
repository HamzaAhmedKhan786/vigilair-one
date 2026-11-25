from collections import defaultdict
from .schemas import Observation

class TrackStore:
    def __init__(self) -> None:
        self._tracks: dict[str, list[Observation]] = defaultdict(list)

    def add(self, observation: Observation) -> list[Observation]:
        self._tracks[observation.track_id].append(observation)
        return self._tracks[observation.track_id]

    def get(self, track_id: str) -> list[Observation]:
        return self._tracks.get(track_id, [])

    def all(self) -> dict[str, list[Observation]]:
        return dict(self._tracks)

    def clear(self) -> None:
        self._tracks.clear()
