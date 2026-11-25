"""Acoustic feature extraction for drone-like rotor evidence.

This is a feature extractor, not a classifier. Low-noise drones may have weak
acoustic evidence; the fusion layer must preserve uncertainty and corroborate
with video, radar, or Remote ID rather than claiming universal detection.
"""
import numpy as np

def extract_acoustic_features(samples: list[float], sample_rate: int, noise_floor_dbfs: float = -60.0) -> dict:
    if not samples or sample_rate <= 0:
        raise ValueError("samples and positive sample_rate are required")
    signal = np.asarray(samples, dtype=np.float32)
    rms = float(np.sqrt(np.mean(signal * signal) + 1e-12))
    rms_dbfs = float(20 * np.log10(max(rms, 1e-6)))
    spectrum = np.abs(np.fft.rfft(signal))
    freqs = np.fft.rfftfreq(len(signal), 1 / sample_rate)
    total = float(np.sum(spectrum) + 1e-9)
    centroid = float(np.sum(freqs * spectrum) / total)
    rotor_band = (freqs >= 80) & (freqs <= 1200)
    rotor_energy = float(np.sum(spectrum[rotor_band]) / total)
    harmonic_score = float(min(1.0, rotor_energy * 1.4))
    confidence = float(max(0.0, min(1.0, harmonic_score * (1.0 if rms_dbfs > noise_floor_dbfs + 3 else 0.45))))
    return {"rms_dbfs": rms_dbfs, "spectral_centroid_hz": centroid, "rotor_band_energy": rotor_energy, "harmonic_score": harmonic_score, "noise_floor_dbfs": noise_floor_dbfs, "confidence": confidence}
