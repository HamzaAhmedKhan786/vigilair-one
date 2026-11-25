import json
from pathlib import Path
from .schemas import Observation

def load_scenario(path: Path) -> list[Observation]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return [Observation.model_validate(item) for item in payload["observations"]]
