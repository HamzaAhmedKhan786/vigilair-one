import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .config import get_settings
from .replay import load_scenario
from .risk_engine import assess_risk
from .schemas import AudioObservation, Camera, EnvironmentObservation, GeoPoint, GlobalTrackObservation, HandoffRequest, IncidentReport, Observation, OperatorDecision, OwnshipState, SensorFusionRequest, Site
from .agent import build_operator_brief
from .hardware import observation_from_hardware
from .tracker import TrackStore
from .audio import extract_acoustic_features
from .fusion import fuse_sensors
from .geometry import analyze_track
from .resource_allocator import allocate
from .calibration import load_calibrations
from .decision_engine import decision_packet
from .geospatial import evaluate_handoff, haversine_m
from .multisite import GlobalTrackStore

settings = get_settings()
app = FastAPI(title="VIGILAIR ONE API", version="0.1.0", description="Decision-support API; no physical-control interface.")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["*"], allow_headers=["*"])
store = TrackStore(); decisions: dict[str, list[OperatorDecision]] = {}
calibrations = load_calibrations(settings.resolve(settings.calibration_path))
site_registry = [Site.model_validate(item) for item in json.loads(settings.resolve(settings.sites_path).read_text(encoding="utf-8"))["sites"]]
environment_events: list[EnvironmentObservation] = []
global_tracks = GlobalTrackStore()

@app.get("/health")
def health():
    return {"status": "ok", "site_id": settings.site_id, "physical_control": False}

@app.get("/api/cameras", response_model=list[Camera])
def cameras():
    return json.loads(settings.resolve(settings.camera_config_path).read_text(encoding="utf-8"))

@app.get("/api/sites", response_model=list[Site])
def sites(): return site_registry

@app.post("/api/geospatial/distance")
def geospatial_distance(points: list[GeoPoint]):
    if len(points) != 2: raise HTTPException(422,"exactly two points are required")
    return {"distance_m":round(haversine_m(points[0],points[1]),2)}

@app.post("/api/handoffs/evaluate")
def handoff(request: HandoffRequest): return evaluate_handoff(request)

@app.post("/api/global-tracks/{global_track_id}/observations")
def add_global_observation(global_track_id: str, observation: GlobalTrackObservation):
    if observation.global_track_id != global_track_id: raise HTTPException(422,"path and payload global track IDs differ")
    try: return {"observations":global_tracks.add(observation)}
    except ValueError as exc: raise HTTPException(409,str(exc)) from exc

@app.get("/api/global-tracks")
def list_global_tracks(): return global_tracks.summaries()

@app.get("/api/global-tracks/{global_track_id}")
def get_global_track(global_track_id: str):
    observations=global_tracks.get(global_track_id)
    if not observations: raise HTTPException(404,"global track not found")
    return {"global_track_id":global_track_id,"observations":observations}

@app.post("/api/calibration/pixel-to-site")
def pixel_to_site(payload: dict):
    camera_id = str(payload["camera_id"])
    if camera_id not in calibrations: raise HTTPException(404, "camera calibration not found")
    return calibrations[camera_id].pixel_to_site(float(payload["x"]), float(payload["y"]))

@app.post("/api/observations", response_model=dict)
def ingest(observation: Observation):
    observations = store.add(observation)
    return {"observation": observation, "risk": assess_risk(observations, (650, 250, 900, 450))}

@app.post("/api/hardware/observations", response_model=dict)
def ingest_hardware(payload: dict):
    observation = observation_from_hardware(payload)
    return ingest(observation)

@app.post("/api/hardware/audio-features", response_model=AudioObservation)
def audio_features(payload: dict):
    features = extract_acoustic_features(payload["samples"], int(payload["sample_rate"]), float(payload.get("noise_floor_dbfs", -60)))
    return AudioObservation(timestamp=payload["timestamp"], sensor_id=payload["sensor_id"], track_id=payload.get("track_id"), source=payload.get("source", "hardware-audio"), **features)

@app.post("/api/hardware/environment", response_model=EnvironmentObservation)
def ingest_environment(observation: EnvironmentObservation):
    environment_events.append(observation)
    if len(environment_events) > 1000: del environment_events[:-1000]
    return observation

@app.get("/api/hardware/environment/latest", response_model=list[EnvironmentObservation])
def latest_environment(): return environment_events[-50:]

@app.post("/api/fusion/evaluate")
def evaluate_fusion(request: SensorFusionRequest):
    return fuse_sensors(request)

@app.post("/api/replay/reset")
def replay_reset():
    store.clear(); global_tracks.clear(); decisions.clear()
    observations = load_scenario(settings.resolve(settings.scenario_path))
    for observation in observations:
        store.add(observation)
        if observation.latitude is not None and observation.longitude is not None:
            global_tracks.add(GlobalTrackObservation(timestamp=observation.timestamp,global_track_id=f"GLOBAL-{observation.track_id.split('-')[-1]}",site_id=observation.site_id,local_track_id=observation.track_id,position=GeoPoint(latitude=observation.latitude,longitude=observation.longitude,altitude_m=observation.altitude_m or 0),classification=observation.class_name,confidence=observation.confidence))
    return {"loaded_observations": len(observations), "tracks": list(store.all())}

@app.get("/api/tracks")
def tracks():
    return [{"track_id": track_id, "observations": values, "risk": assess_risk(values, (650, 250, 900, 450))} for track_id, values in store.all().items()]

@app.get("/api/tracks/{track_id}/analytics")
def track_analytics(track_id: str):
    observations = store.get(track_id)
    if not observations: raise HTTPException(404, "track not found")
    try: return analyze_track(observations, (120, 60, 180, 120))
    except ValueError as exc: raise HTTPException(422, str(exc)) from exc

@app.post("/api/tracks/{track_id}/relative-analytics")
def relative_analytics(track_id: str, ownship: OwnshipState):
    observations = store.get(track_id)
    if not observations: raise HTTPException(404, "track not found")
    try: return analyze_track(observations, (120, 60, 180, 120), ownship=ownship)
    except ValueError as exc: raise HTTPException(422, str(exc)) from exc

@app.get("/api/tracks/{track_id}/resource-allocation")
def resource_allocation(track_id: str):
    observations = store.get(track_id)
    if not observations: raise HTTPException(404, "track not found")
    risk = assess_risk(observations, (650, 250, 900, 450))
    return allocate(track_id, risk.score)

@app.post("/api/tracks/{track_id}/decisions", response_model=OperatorDecision)
def decide(track_id: str, decision: OperatorDecision):
    if not store.get(track_id): raise HTTPException(404, "track not found")
    decisions.setdefault(track_id, []).append(decision)
    return decision

@app.get("/api/incidents/{track_id}", response_model=IncidentReport)
def incident(track_id: str):
    observations = store.get(track_id)
    if not observations: raise HTTPException(404, "track not found")
    return IncidentReport(incident_id=f"INC-{track_id}", site_id=settings.site_id, track_id=track_id, opened_at=observations[0].timestamp, observations=observations, risk=assess_risk(observations, (650, 250, 900, 450)), decisions=decisions.get(track_id, []))

@app.get("/api/tracks/{track_id}/brief")
def operator_brief(track_id: str):
    observations = store.get(track_id)
    if not observations: raise HTTPException(404, "track not found")
    return build_operator_brief(assess_risk(observations, (650, 250, 900, 450)))

@app.get("/api/tracks/{track_id}/decision-packet")
def track_decision_packet(track_id: str):
    observations=store.get(track_id)
    if not observations: raise HTTPException(404,"track not found")
    risk=assess_risk(observations,(650,250,900,450))
    try: analytics=analyze_track(observations,(120,60,180,120))
    except ValueError as exc: raise HTTPException(422,str(exc)) from exc
    return decision_packet(risk,analytics)
