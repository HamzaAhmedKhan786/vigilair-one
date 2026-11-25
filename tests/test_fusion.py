from datetime import datetime, timezone
from backend.fusion import fuse_sensors
from backend.schemas import AudioObservation, SensorFusionRequest

def test_weak_audio_does_not_override_camera_uncertainty():
    result = fuse_sensors(SensorFusionRequest(track_id="T-1", camera_confidence=0.7, audio=AudioObservation(timestamp=datetime.now(timezone.utc), sensor_id="MIC-1", rms_dbfs=-58, spectral_centroid_hz=320, rotor_band_energy=.2, harmonic_score=.2, noise_floor_dbfs=-60, confidence=.2)))
    assert result.level == "review"
    assert any("weak" in item for item in result.limitations)

def test_multisensor_result_is_corroborated():
    result = fuse_sensors(SensorFusionRequest(track_id="T-2", camera_confidence=.9, radar_confidence=.85, remote_id_match=True))
    assert result.fused_confidence >= .85
    assert result.level == "corroborated"
