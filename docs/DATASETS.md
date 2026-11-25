# Dataset plan

Always verify the current license and access terms before downloading or redistributing data. Keep third-party datasets outside Git; store only manifests, hashes, and locally generated derivatives that the license permits.

## Recommended sources

- Anti-UAV: RGB and thermal infrared UAV tracking benchmark. Suitable for visible/thermal tracking and night-condition experiments.
- Drone-vs-Bird / SafeShore challenge data: annotated videos intended to distinguish drones from birds; access may require a data-usage agreement.
- YOLOBirDrone: drone and bird images with bounding boxes; free non-commercial research use is described by the provider, while commercial use requires permission.
- NRC CUAS sensing dataset: labeled UAV-versus-bird radar track CSVs for kinematic classification.
- VETD220: synchronized visible and event-camera sequences for anti-UAV tracking research.

VisDrone is useful for aerial-view object detection and multi-object tracking, but it is not by itself a fixed-camera counter-UAS dataset. Use it for small-object and tracking pretraining, not as the only evaluation source.

## Local synthetic asset

`public/demo/night-camera-synthetic.png` is an AI-generated synthetic frame created for this repository. It contains a small drone candidate and a bird candidate and can be redistributed with this project demo. It is not evidence of model accuracy.

## Split policy

Split by entire video, location, weather, and recording session. Never randomly split adjacent frames across train and test sets; that leaks nearly identical imagery and inflates performance.
