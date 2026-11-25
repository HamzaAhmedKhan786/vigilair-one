# VIGILAIR ONE — system design and architecture

## Purpose

VIGILAIR ONE is a low-cost, human-in-the-loop aerial awareness layer for sites that already have ordinary CCTV. It detects and tracks likely drones, explains risk, and lets an operator accept, modify, or reject simulated response recommendations. It does not command a weapon, jammer, drone, interceptor, vehicle, or other physical system.

## Runtime architecture

```text
RGB / thermal cameras ──> capture adapters ──> local detector
                                                  │
                                                  v
                                     tracker + cross-camera association
                                                  │
                       observations / paths / thumbnails / evidence clips
                                                  │
                              risk engine + geofence + policy rules
                                                  │
                              FastAPI site gateway / WebSocket later
                                                  │
                              React operator console + audit log
```

The edge box should process frames locally and send metadata rather than full video by default. The gateway stores short evidence clips only when a track becomes relevant. A multi-site control plane can aggregate incident metadata while retaining site-level video custody.

## Backend modules

- `backend/main.py`: HTTP contract for health, cameras, observations, replay, tracks, decisions, and incident reports.
- `backend/schemas.py`: typed payloads and enum-constrained operator actions.
- `backend/tracker.py`: deterministic in-memory store for the demo; replace with Redis/Postgres for a deployed site.
- `backend/risk_engine.py`: transparent baseline score, intentionally separate from ML inference.
- `backend/replay.py`: loads licensed or synthetic scenario data.
- `backend/config.py`: environment-driven settings and safe path resolution.

## Data flow and timing targets

1. Capture: 8–15 FPS per camera, configurable.
2. Inference: detect every 2–4 frames; track between detections.
3. Association: preserve a track ID across camera handoff using timestamp, projected position, camera topology, and appearance embedding when available.
4. Alert: emit an elevated event when score crosses a threshold or a geofence transition occurs.
5. Operator: recommendation must show reasons, evidence, confidence, and legal/scope boundary before action buttons.
6. Audit: every decision is append-only with operator ID, timestamp, action, and optional note.

## Scale path

Single site: one edge GPU/CPU box, four cameras, local SQLite/object storage, one console.

Multi-site: one gateway per site, central event bus for metadata, tenant/site IDs on every record, regional object storage, and a fleet view with degraded-connectivity store-and-forward. Keep the video plane site-local; replicate only incident metadata and selected evidence.

## Safety and security controls

- No API routes for physical intervention or weapon control.
- RBAC: viewer, operator, supervisor, auditor.
- Signed evidence manifests and UTC timestamps.
- Encrypt video/object storage and restrict retention.
- Treat model output as untrusted evidence; risk decisions remain deterministic and inspectable.
- Log false positives and operator overrides for threshold calibration.
