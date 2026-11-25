# Algorithm selection

## Baseline pipeline

1. Detector: fine-tuned small YOLO model on licensed/synthetic drone, bird, aircraft, balloon, and background examples.
2. In-camera tracking: ByteTrack for the fastest fixed-camera baseline; compare with BoT-SORT or TrackTrack when identity switches or camera motion become important.
3. Metric localization: camera calibration plus image-to-ground/site transformation. Monocular altitude and range are estimates unless stereo, radar, known-size, or other depth evidence is available.
4. Cross-camera association: time gap, predicted site position, class, camera topology, and optional appearance embedding.
5. Behavior analytics: dwell, loiter radius, speed, acceleration, turn rate, geofence distance, ETA, and closest point of approach.
6. Sensor fusion: conservatively weight camera, acoustic, thermal, radar, Remote ID, weather, and sensor-health evidence.
7. Risk and recommendations: deterministic policy rules first, with human review and a complete audit trail.

The implementation includes planar homography calibration (`backend/calibration.py`) and a constant-velocity Kalman filter (`backend/kalman.py`). The Kalman filter smooths noisy site-coordinate measurements and predicts short gaps; it does not create evidence when the sensor has lost the target.

## Should we use XGBoost?

XGBoost can be useful later for tabular risk classification once the team has enough labeled operator outcomes. Candidate features are detector confidence, dwell, speed, turn rate, geofence distance, acoustic confidence, radar confidence, and sensor count. It should not replace the detector or tracker.

For the hackathon, deterministic scoring is preferable because it works with little data and is directly explainable. `backend/ml_risk.py` provides an optional JSON-model training path and refuses datasets with fewer than 50 rows. Use train/validation/test splits by video or site—not random frames—to avoid leakage.

## Evaluation

- Detection: precision, recall, mAP by day/night, range, target size, and weather.
- Tracking: IDF1, HOTA, ID switches, fragmentation, and track continuity across cameras.
- Localization: median/95th percentile position and distance error in meters.
- Alerts: false alarms per camera-hour, missed geofence entries, time-to-alert.
- Runtime: end-to-end latency, FPS, CPU/GPU/RAM/power.
- Human factors: recommendation acceptance, rejection reasons, report completeness.
