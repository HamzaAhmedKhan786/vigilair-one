from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[1]

class Settings(BaseSettings):
    app_env: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    log_level: str = "INFO"
    site_id: str = "berlin-brandenburg-demo"
    site_name: str = "Brandenburg Perimeter"
    camera_config_path: str = "data/cameras.json"
    scenario_path: str = "data/scenario.json"
    calibration_path: str = "data/calibrations.json"
    sites_path: str = "data/sites.json"
    weather_enabled: bool = True
    evidence_dir: str = "data/evidence"
    model_provider: str = "local"
    detector_model: str = "yolo11n.pt"
    detector_device: str = "cpu"
    detector_confidence: float = 0.35
    challenge05_dataset_dir: str | None = None
    acoustic_model_path: str | None = None
    acoustic_onnx_path: str | None = None
    acoustic_onnx_sha256: str | None = None
    acoustic_wake_threshold: float | None = None
    acoustic_architecture: str = "mobilenet_v3_small"
    rfdetr_onnx_path: str | None = None
    rfdetr_onnx_sha256: str | None = None
    rfdetr_class_names: str | None = None
    tracker_type: str = "bytetrack"
    featherless_api_key: str | None = None
    featherless_base_url: str = "https://api.featherless.ai/v1"
    featherless_model: str = "zai-org/GLM-5.3-Flash"
    database_url: str = "sqlite:///./data/vigilair.db"
    decision_db_path: str = "data/operator_decisions.db"
    research_models_path: str = "models"
    research_sites_path: str = "data/research_sites.json"
    research_media_db_path: str = "data/research_media.db"
    research_media_path: str = "artifacts/media"
    retention_days: int = 30
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    def resolve(self, value: str) -> Path:
        path = Path(value)
        return path if path.is_absolute() else ROOT / path

@lru_cache
def get_settings() -> Settings:
    return Settings()
