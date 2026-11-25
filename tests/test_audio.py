import numpy as np
from backend.audio import extract_acoustic_features

def test_audio_features_are_bounded():
    samples = np.sin(np.linspace(0, 2 * np.pi * 120, 4096)).tolist()
    result = extract_acoustic_features(samples, 16000)
    assert result["rms_dbfs"] <= 0
    assert 0 <= result["confidence"] <= 1
    assert 0 <= result["rotor_band_energy"] <= 1
