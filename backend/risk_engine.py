from datetime import datetime, timezone
from .schemas import ActionType, Observation, RiskAssessment

def assess_risk(observations: list[Observation], restricted_zone: tuple[float, float, float, float]) -> RiskAssessment:
    if not observations:
        raise ValueError("at least one observation is required")
    latest = observations[-1]
    dwell_seconds = max(0, int((latest.timestamp - observations[0].timestamp).total_seconds()))
    x, y = latest.centroid_xy
    left, top, right, bottom = restricted_zone
    near_zone = left - 80 <= x <= right + 80 and top - 80 <= y <= bottom + 80
    score = 0; reasons: list[str] = []
    if latest.class_name.lower() in {"drone", "uas", "quadcopter"}:
        score += 35; reasons.append("drone morphology classification")
    if latest.confidence >= 0.8:
        score += 15; reasons.append("high object confidence")
    if dwell_seconds >= 120:
        score += 25; reasons.append(f"dwell time exceeded: {dwell_seconds}s")
    elif dwell_seconds >= 30:
        score += 12; reasons.append(f"persistent dwell: {dwell_seconds}s")
    if near_zone:
        score += 20; reasons.append("restricted-zone proximity")
    if latest.speed_mps >= 3:
        score += 5; reasons.append("directed movement")
    score = min(100, score)
    level = "critical" if score >= 80 else "elevated" if score >= 50 else "low"
    actions = [ActionType.preserve_evidence, ActionType.allocate_camera]
    if score >= 50: actions += [ActionType.warn_staff, ActionType.pause_zone]
    if score >= 80: actions.insert(0, ActionType.notify_police)
    return RiskAssessment(track_id=latest.track_id, score=score, level=level, reasons=reasons, recommended_actions=actions, created_at=datetime.now(timezone.utc))
