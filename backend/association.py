"""Cross-camera candidate scoring without hardware-specific assumptions."""
import math
from .schemas import Observation

def association_cost(previous: Observation, candidate: Observation, max_gap_s: float = 10.0) -> float:
    gap = abs((candidate.timestamp - previous.timestamp).total_seconds())
    if gap > max_gap_s or previous.class_name != candidate.class_name: return math.inf
    time_cost = gap / max_gap_s
    position_cost = 0.5
    if previous.site_position_m and candidate.site_position_m:
        dx = candidate.site_position_m[0]-previous.site_position_m[0]; dy = candidate.site_position_m[1]-previous.site_position_m[1]
        position_cost = min(1.0, math.hypot(dx,dy)/100.0)
    appearance_cost = 0.5
    if previous.appearance_embedding and candidate.appearance_embedding:
        dot = sum(a*b for a,b in zip(previous.appearance_embedding,candidate.appearance_embedding))
        na = math.sqrt(sum(a*a for a in previous.appearance_embedding)); nb = math.sqrt(sum(b*b for b in candidate.appearance_embedding))
        appearance_cost = 1 - max(-1.0,min(1.0,dot/max(na*nb,1e-9)))
    return round(0.35*time_cost + 0.45*position_cost + 0.20*appearance_cost, 4)

def is_same_track(previous: Observation, candidate: Observation, threshold: float = 0.55, max_gap_s: float = 10.0) -> bool:
    return association_cost(previous, candidate, max_gap_s=max_gap_s) <= threshold
