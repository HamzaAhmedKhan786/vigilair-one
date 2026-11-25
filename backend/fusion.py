from .schemas import SensorFusionRequest, SensorFusionResult

def fuse_sensors(request: SensorFusionRequest) -> SensorFusionResult:
    """Conservative weighted fusion with explicit degraded-sensor limits."""
    weighted = [(request.camera_confidence, 0.55 * request.camera_health_score)]
    reasons = [f"camera confidence {request.camera_confidence:.0%}"]
    limitations: list[str] = []
    if request.audio is not None:
        audio_weight = 0.20 if request.audio.confidence >= 0.5 else 0.08
        weighted.append((request.audio.confidence, audio_weight))
        reasons.append(f"acoustic evidence {request.audio.confidence:.0%}")
        if request.audio.confidence < 0.5: limitations.append("acoustic signal is weak or near the noise floor")
    if request.radar_confidence is not None:
        weighted.append((request.radar_confidence, 0.20))
        reasons.append(f"radar corroboration {request.radar_confidence:.0%}")
    if request.remote_id_match:
        weighted.append((1.0, 0.15)); reasons.append("Remote ID match present")
    total_weight = sum(weight for _, weight in weighted)
    confidence = sum(value * weight for value, weight in weighted) / max(total_weight, 1e-6)
    sensor_count = 1 + int(request.audio is not None) + int(request.radar_confidence is not None) + int(request.remote_id_match)
    if sensor_count == 1: limitations.append("single-sensor result; keep operator review required")
    if request.camera_health_score < 0.8: limitations.append("camera health degraded; confidence down-weighted")
    level = "corroborated" if confidence >= 0.75 and sensor_count >= 2 else "review" if confidence >= 0.45 else "weak"
    return SensorFusionResult(track_id=request.track_id, fused_confidence=round(confidence, 3), sensor_count=sensor_count, level=level, reasons=reasons, limitations=limitations)
