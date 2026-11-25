# Data contract and expected inputs

## Camera input

Minimum: an RTSP/HTTP stream or a local video file, camera ID, site ID, UTC timestamp, resolution, and FPS.

Useful optional fields: lens/FOV, camera pose, GPS position, calibration matrix, infrared/thermal channel, night mode, and health metrics such as dropped frames and bitrate.

## Per-frame detection

```json
{
  "timestamp": "2026-11-25T21:01:12Z",
  "camera_id": "CAM-02",
  "class_name": "drone",
  "confidence": 0.91,
  "bbox_xyxy": [690, 310, 755, 360],
  "mask_uri": null,
  "frame_uri": "evidence/CAM-02/2026-11-25T210112Z.jpg"
}
```

## Tracking observation

The backend adds `track_id`, centroid, speed, heading, source, and association metadata. The demo schema is intentionally camera-coordinate based. A hardware-ready version should add normalized coordinates and, when calibrated, site coordinates in meters.

## Optional sensor values

- Thermal/RGB: frame URI, exposure, sensor temperature, calibration ID.
- Radar: range meters, azimuth/elevation, radial velocity, track quality.
- RF/Remote ID: frequency band, protocol, signal strength, broadcast ID when legally available.
- Acoustic: bearing, confidence, sample window URI.
- Site telemetry: wind speed/direction, precipitation, visibility, GNSS quality, camera health.

These values support corroboration and false-alarm reduction. They are not required for the first demo.

## Evidence and retention

Store a short pre/post-event clip, representative frames, JSON observations, model version, and a hash manifest. Default demo retention is 30 days; production retention must follow the operator’s legal and privacy policy.

## Dummy data

`data/cameras.json` models four ordinary RGB cameras. `data/scenario.json` includes a likely drone that crosses cameras and a low-confidence bird false alarm. It is sufficient to exercise replay, risk scoring, operator decisions, and incident export.
