# VIGILAIR ONE synthetic test data

All files in this folder are synthetic fixtures for local development and demos. They are not real surveillance data and must be replaced or streamed through adapters before operational use.

## Fixture types

- `video_manifest.json`: video/file or RTSP metadata, frame timing, camera calibration placeholders.
- `detections.jsonl`: detector outputs per frame.
- `tracks.jsonl`: persistent track observations and behavior features.
- `radar_tracks.jsonl`: optional radar corroboration.
- `thermal_observations.jsonl`: optional thermal-camera corroboration.
- `remote_id.jsonl`: optional broadcast/Remote ID metadata.
- `acoustic_events.jsonl`: optional acoustic bearing events.
- `weather.jsonl`: wind, visibility, and precipitation context.
- `camera_health.jsonl`: dropped frames, latency, and stream health.
- `incidents.json`: incident, recommendation, operator decision, and audit examples.
- `site_geometry.json`: local metric zones, protected assets, and an optional ownship example.
- `risk_training_template.csv`: feature schema only; four rows are intentionally insufficient to train a deployable model.
- `multisite_tracks.jsonl`: latitude/longitude handoff candidate between two sites.
- `light_motion.jsonl`: lux, motion, IR, thermal contrast, and visibility observations.

Expected live adapters should preserve UTC timestamps, stable camera IDs, source IDs, and a common `track_id` where association is available.
