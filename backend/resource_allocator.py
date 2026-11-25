"""Simulated allocation of observation resources only."""
from dataclasses import dataclass, asdict

@dataclass
class Resource:
    resource_id: str
    kind: str
    available: bool
    capability: str

DEFAULT_RESOURCES = [Resource("CAM-PTZ-01","camera",True,"visual follow"),Resource("THERMAL-01","camera",True,"thermal confirmation"),Resource("OP-02","operator",True,"secondary review"),Resource("REC-01","recorder",True,"evidence capture")]

def allocate(track_id: str, risk_score: int, resources: list[Resource] | None = None) -> dict:
    pool = resources or DEFAULT_RESOURCES
    wanted = {"recorder"}
    if risk_score >= 50: wanted |= {"camera","operator"}
    selected = [r for r in pool if r.available and r.kind in wanted]
    return {"track_id":track_id,"risk_score":risk_score,"allocations":[asdict(r) for r in selected],"simulated":True,"physical_control":False}
