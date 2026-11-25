# Low-cost hardware plan

## Recommended MVP

- Four existing fixed RGB/IR CCTV cameras with RTSP streams.
- One edge computer: organizer-provided GPU device when available, otherwise a laptop/mini-PC for prerecorded demo.
- One USB microphone array for directional acoustic evidence.
- Existing network switch/PoE and local SSD for short evidence clips.
- Optional thermal camera, Remote ID receiver, or compact radar as independent corroborating sensors.

This is a fixed-site counter-UAS awareness product. It does not require a drone to detect other drones. A friendly drone would add regulatory, battery, link-security, weather, and safety burdens and is unnecessary for the weekend MVP.

## Metric distance requirements

Pixel coordinates alone cannot provide reliable physical distance. Each camera needs intrinsic calibration and a site transform based on surveyed reference points. For altitude/range, use overlapping calibrated cameras, radar, a depth sensor, or a defensible object-size estimate with uncertainty. Store calibration version and uncertainty with every metric result.

## Optional ownship

If a future friendly airborne sensor is introduced, send its timestamped 3D position and velocity to the relative-analytics endpoint. The backend computes relative distance and closest point of approach only; it does not send flight commands.
