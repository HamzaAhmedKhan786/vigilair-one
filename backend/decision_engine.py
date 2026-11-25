"""Deterministic decision packet with bounded AI narrative support."""
from .agent import build_operator_brief
from .resource_allocator import allocate

def decision_packet(risk, analytics, fusion=None) -> dict:
    return {"track_id":risk.track_id,"deterministic":{"risk":risk.model_dump(),"analytics":analytics.model_dump(),"fusion":fusion.model_dump() if fusion else None},"ai_assistance":build_operator_brief(risk),"resource_allocation":allocate(risk.track_id,risk.score),"operator_gate":{"required":True,"allowed_decisions":["accepted","modified","rejected"]},"prohibited_actions":["jamming","device_takeover","weapon_control","physical_interception","flight_control"]}
