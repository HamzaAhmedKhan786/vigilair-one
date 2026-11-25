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
    evidence_dir: str = "data/evidence"
    model_provider: str = "local"
    detector_model: str = "yolo11n.pt"
    detector_device: str = "cpu"
    detector_confidence: float = 0.35
    tracker_type: str = "bytetrack"
    featherless_api_key: str | None = None
    featherless_base_url: str = "https://api.featherless.ai/v1"
    featherless_model: str = "zai-org/GLM-5.3-Flash"
    database_url: str = "sqlite:///./data/vigilair.db"
    decision_db_path: str = "data/operator_decisions.db"
    retention_days: int = 30
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    def resolve(self, value: str) -> Path:
        path = Path(value)
        return path if path.is_absolute() else ROOT / path

@lru_cache
def get_settings() -> Settings:
    return Settings()
