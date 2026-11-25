from datetime import datetime
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
    source: str = "synthetic"

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

class IncidentReport(BaseModel):
    incident_id: str
    site_id: str
    track_id: str
    opened_at: datetime
    closed_at: datetime | None = None
    observations: list[Observation]
    risk: RiskAssessment
    decisions: list[OperatorDecision] = []
