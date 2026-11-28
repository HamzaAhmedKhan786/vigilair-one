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
from .hybrid_replay import FIXTURE as HYBRID_FIXTURE, evaluate as evaluate_hybrid, load_replay as load_hybrid_replay
from .geometry import analyze_track
from .resource_allocator import allocate
from .calibration import load_calibrations
from .decision_engine import decision_packet
from .decision_store import DecisionStore
from .geospatial import evaluate_handoff, haversine_m
from .multisite import GlobalTrackStore
from .model_integration.api import router as acoustic_model_router, visual_router
from .research.api import router as research_router
from .weather import WeatherService, WeatherUnavailable

settings = get_settings()
app = FastAPI(title="VIGILAIR ONE API", version="0.1.0", description="Decision-support API; no physical-control interface.")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["*"], allow_headers=["*"])
app.include_router(acoustic_model_router)
app.include_router(visual_router)
app.include_router(research_router)
store = TrackStore()
decisions = DecisionStore(settings.resolve(settings.decision_db_path))
calibrations = load_calibrations(settings.resolve(settings.calibration_path))
site_registry = [Site.model_validate(item) for item in json.loads(settings.resolve(settings.sites_path).read_text(encoding="utf-8"))["sites"]]
weather = WeatherService(site_registry)
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


@app.get("/api/sites/{site_id}/weather")
def site_weather(site_id: str):
    site = next((site for site in site_registry if site.site_id == site_id), None)
    if site is None:
        raise HTTPException(404, "Site not found")
    if not settings.weather_enabled:
        return {"site_id": site_id, "status": "disabled"}
    try:
        return weather.current(site)
    except WeatherUnavailable as error:
        raise HTTPException(503, "Regional weather is unavailable", headers={"Retry-After": "60"}) from error

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


@app.get("/api/experiments/hybrid-replay")
def hybrid_replay():
    return evaluate_hybrid(load_hybrid_replay(HYBRID_FIXTURE))

@app.post("/api/replay/reset")
def replay_reset():
    store.clear(); global_tracks.clear()
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
def track_analytics(track_id: str, site_id: str | None = None):
    observations = store.get(track_id)
    if site_id is not None:
        observations = sorted(
            (item for item in observations if item.site_id == site_id),
            key=lambda item: item.timestamp,
        )
    if not observations: raise HTTPException(404, "track not found")
    try:
        zone = (120, 60, 180, 120) if site_id in (None, 'berlin-brandenburg-demo') else None
        analytics = analyze_track(observations, zone)
    except ValueError as exc: raise HTTPException(422, str(exc)) from exc
    metric = [item for item in observations if item.site_position_m is not None]
    anchor = metric[-1]
    return {
        **analytics.model_dump(),
        "forecast_anchor": anchor,
        "forecast_step_seconds": 5,
        "forecast_horizon_seconds": 30,
        "metric_observation_count": len({item.timestamp for item in metric}),
    }

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
    observations = store.get(track_id)
    if not observations: raise HTTPException(404, "track not found")
    if decision.action not in assess_risk(observations, (650, 250, 900, 450)).recommended_actions:
        raise HTTPException(422, "Action is not a current recommendation for this track")
    if decision.decision == "modified" and not (decision.note or "").strip():
        raise HTTPException(422, "Modified decisions require an operator note")
    decisions.add(observations[0], decision)
    return decision

@app.get("/api/incidents/{track_id}", response_model=IncidentReport)
def incident(track_id: str):
    observations = store.get(track_id)
    if not observations: raise HTTPException(404, "track not found")
    first = observations[0]
    return IncidentReport(incident_id=f"INC-{track_id}", site_id=first.site_id, track_id=track_id, opened_at=first.timestamp, observations=observations, risk=assess_risk(observations, (650, 250, 900, 450)), decisions=decisions.history(first))

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
