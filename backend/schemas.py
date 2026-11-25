from datetime import datetime, timezone
from enum import Enum
from pydantic import BaseModel, Field

class ActionType(str, Enum):
    notify_police = "notify_police"
    pause_zone = "pause_zone"
    warn_staff = "warn_staff"
    preserve_evidence = "preserve_evidence"
    allocate_camera = "allocate_camera"

class Camera(BaseModel):
    camera_id: str
    name: str
    stream_uri: str
    site_id: str
    latitude: float | None = None
    longitude: float | None = None
    fps: int = 12
    resolution: str = "1920x1080"
    sensor_type: str = "rgb"
    status: str = "online"

class Observation(BaseModel):
    timestamp: datetime
    camera_id: str
    track_id: str
    class_name: str
    confidence: float = Field(ge=0, le=1)
    bbox_xyxy: list[float] = Field(min_length=4, max_length=4)
    centroid_xy: list[float] = Field(min_length=2, max_length=2)
    speed_mps: float = Field(ge=0)
    heading_deg: float = Field(ge=0, lt=360)
    site_position_m: list[float] | None = Field(default=None, min_length=2, max_length=3)
    appearance_embedding: list[float] | None = None
    source: str = "synthetic"

class OwnshipState(BaseModel):
    timestamp: datetime
    object_id: str = "OWN-01"
    position_m: list[float] = Field(min_length=2, max_length=3)
    velocity_mps: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0], min_length=2, max_length=3)

class TrackAnalytics(BaseModel):
    track_id: str
    path_length_m: float
    displacement_m: float
    current_speed_mps: float
    average_speed_mps: float
    heading_deg: float
    acceleration_mps2: float
    turn_rate_deg_s: float
    dwell_seconds: float
    distance_to_restricted_zone_m: float | None
    eta_to_restricted_zone_s: float | None
    distance_to_ownship_m: float | None = None
    closest_approach_m: float | None = None
    closest_approach_seconds: float | None = None
    behaviors: list[str]
    predicted_path_m: list[list[float]]

class AudioObservation(BaseModel):
    timestamp: datetime
    sensor_id: str
    track_id: str | None = None
    rms_dbfs: float = Field(ge=-120, le=0)
    spectral_centroid_hz: float = Field(ge=0)
    rotor_band_energy: float = Field(ge=0, le=1)
    harmonic_score: float = Field(ge=0, le=1)
    noise_floor_dbfs: float = Field(ge=-120, le=0)
    confidence: float = Field(ge=0, le=1)
    source: str = "synthetic"

class SensorFusionRequest(BaseModel):
    track_id: str
    camera_confidence: float = Field(ge=0, le=1)
    audio: AudioObservation | None = None
    radar_confidence: float | None = Field(default=None, ge=0, le=1)
    remote_id_match: bool = False
    camera_health_score: float = Field(default=1.0, ge=0, le=1)

class SensorFusionResult(BaseModel):
    track_id: str
    fused_confidence: float = Field(ge=0, le=1)
    sensor_count: int
    level: str
    reasons: list[str]
    limitations: list[str]

class RiskAssessment(BaseModel):
    track_id: str
    score: int = Field(ge=0, le=100)
    level: str
    reasons: list[str]
    recommended_actions: list[ActionType]
    created_at: datetime

class OperatorDecision(BaseModel):
    action: ActionType
    decision: str = Field(pattern="^(accepted|rejected|modified)$")
    operator_id: str = "demo-operator"
    note: str | None = None
    decided_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class IncidentReport(BaseModel):
    incident_id: str
    site_id: str
    track_id: str
    opened_at: datetime
    closed_at: datetime | None = None
    observations: list[Observation]
    risk: RiskAssessment
    decisions: list[OperatorDecision] = Field(default_factory=list)
