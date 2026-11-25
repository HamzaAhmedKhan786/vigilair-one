import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .config import get_settings
from .replay import load_scenario
from .risk_engine import assess_risk
from .schemas import AudioObservation, Camera, IncidentReport, Observation, OperatorDecision, SensorFusionRequest
from .agent import build_operator_brief
from .hardware import observation_from_hardware
from .tracker import TrackStore
from .audio import extract_acoustic_features
from .fusion import fuse_sensors

settings = get_settings()
app = FastAPI(title="VIGILAIR ONE API", version="0.1.0", description="Decision-support API; no physical-control interface.")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["*"], allow_headers=["*"])
store = TrackStore(); decisions: dict[str, list[OperatorDecision]] = {}

@app.get("/health")
def health():
    return {"status": "ok", "site_id": settings.site_id, "physical_control": False}

@app.get("/api/cameras", response_model=list[Camera])
def cameras():
    return json.loads(settings.resolve(settings.camera_config_path).read_text(encoding="utf-8"))

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

@app.post("/api/fusion/evaluate")
def evaluate_fusion(request: SensorFusionRequest):
    return fuse_sensors(request)

@app.post("/api/replay/reset")
def replay_reset():
    store.clear(); decisions.clear()
    observations = load_scenario(settings.resolve(settings.scenario_path))
    for observation in observations: store.add(observation)
    return {"loaded_observations": len(observations), "tracks": list(store.all())}

@app.get("/api/tracks")
def tracks():
    return [{"track_id": track_id, "observations": values, "risk": assess_risk(values, (650, 250, 900, 450))} for track_id, values in store.all().items()]

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
