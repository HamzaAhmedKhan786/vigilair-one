"""Hardware-neutral adapters.

Adapters emit the same Observation contract, so organizer hardware can be
plugged in without changing tracking, risk, or UI code. These are safe input
adapters only; they contain no actuator/control commands.
"""
from datetime import datetime, timezone
from typing import Any
from .schemas import Observation

class SensorAdapter:
    sensor_type = "generic"
    def normalize(self, payload: dict[str, Any]) -> Observation:
        return Observation.model_validate(payload)

class RgbCameraAdapter(SensorAdapter): sensor_type = "rgb"
class ThermalCameraAdapter(SensorAdapter): sensor_type = "thermal"
class RadarAdapter(SensorAdapter): sensor_type = "radar"
class RemoteIdAdapter(SensorAdapter): sensor_type = "remote_id"

def observation_from_hardware(payload: dict[str, Any], adapter: SensorAdapter | None = None) -> Observation:
    """Normalize organizer payloads; missing timestamps default to UTC now."""
    data = dict(payload)
    data.setdefault("timestamp", datetime.now(timezone.utc).isoformat())
    data.setdefault("source", adapter.sensor_type if adapter else "hardware")
    return (adapter or SensorAdapter()).normalize(data)
