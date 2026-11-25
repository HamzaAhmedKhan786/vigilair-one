"""Cached regional weather estimates for configured sites."""
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock
from time import monotonic

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .schemas import Site

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
REFRESH_SECONDS = 900
RETRY_SECONDS = 60
MAX_CACHE_AGE_SECONDS = 3600


class ProviderReading(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    time: int = Field(ge=0)
    interval: int = Field(gt=0)
    temperature_2m: float | None = None
    wind_speed_10m: float | None = Field(default=None, ge=0)
    wind_gusts_10m: float | None = Field(default=None, ge=0)
    wind_direction_10m: float | None = Field(default=None, ge=0, le=360)
    visibility: float | None = Field(default=None, ge=0)
    precipitation: float | None = Field(default=None, ge=0)
    is_day: int | None = Field(default=None, ge=0, le=1)


def fetch_open_meteo(site: Site) -> ProviderReading:
    variables = [key for key in ProviderReading.model_fields if key not in {"time", "interval"}]
    response = httpx.get(FORECAST_URL, params={
        "latitude": site.latitude,
        "longitude": site.longitude,
        "current": ",".join(variables),
        "timezone": "GMT",
        "timeformat": "unixtime",
        "wind_speed_unit": "ms",
        "precipitation_unit": "mm",
    }, timeout=2.5)
    response.raise_for_status()
    return ProviderReading.model_validate(response.json()["current"])


@dataclass
class CachedSite:
    lock: Lock = field(default_factory=Lock)
    retry_at: float = 0
    fetched_at: float = 0
    response: dict | None = None


class WeatherUnavailable(Exception):
    """The provider is unavailable and there is no recent cached value."""


class WeatherService:
    def __init__(self, sites: list[Site], fetch=fetch_open_meteo, clock=monotonic):
        self._cache = {site.site_id: CachedSite() for site in sites}
        self._fetch = fetch
        self._clock = clock

    def current(self, site: Site) -> dict:
        cache = self._cache[site.site_id]
        with cache.lock:
            now = self._clock()
            age = now - cache.fetched_at
            if cache.response is not None and age < REFRESH_SECONDS:
                return {**cache.response, "status": "current"}
            if cache.retry_at <= now:
                try:
                    current = self._fetch(site)
                    valid_at = datetime.fromtimestamp(current.time, tz=timezone.utc)
                except (httpx.HTTPError, ValueError, ValidationError, KeyError, TypeError, OverflowError, OSError):
                    cache.retry_at = self._clock() + RETRY_SECONDS
                else:
                    cache.fetched_at = self._clock()
                    cache.response = {
                        "site_id": site.site_id,
                        "source": "Open-Meteo",
                        "provenance": "regional_model_estimate",
                        "valid_at": valid_at,
                        "retrieved_at": datetime.now(timezone.utc),
                        "interval_seconds": current.interval,
                        "temperature_c": current.temperature_2m,
                        "wind_speed_mps": current.wind_speed_10m,
                        "wind_gust_mps": current.wind_gusts_10m,
                        "wind_direction_deg": current.wind_direction_10m,
                        "visibility_m": current.visibility,
                        "precipitation_mm": current.precipitation,
                        "is_day": bool(current.is_day) if current.is_day is not None else None,
                    }
                    return {**cache.response, "status": "current"}
            if cache.response is not None and age <= MAX_CACHE_AGE_SECONDS:
                return {**cache.response, "status": "stale"}
            raise WeatherUnavailable
