import httpx
import pytest

from backend import main
from backend.schemas import Site
from backend.weather import ProviderReading, WeatherService, WeatherUnavailable, fetch_open_meteo


def test_provider_query_has_normalized_units_and_zero_values(monkeypatch):
    def get(url, *, params, timeout):
        assert url == "https://api.open-meteo.com/v1/forecast"
        assert params["latitude"] == 52.4 and params["longitude"] == 13.5
        assert params["wind_speed_unit"] == "ms"
        assert params["timezone"] == "GMT" and params["timeformat"] == "unixtime"
        assert "visibility" in params["current"]
        return httpx.Response(200, request=httpx.Request("GET", url), json={"current": {
            "time": 1764191700, "interval": 900, "wind_speed_10m": 0,
            "precipitation": 0, "is_day": 0,
        }})

    monkeypatch.setattr("backend.weather.httpx.get", get)
    site = Site(site_id="a", name="A", latitude=52.4, longitude=13.5, coverage_radius_m=100)
    report = WeatherService([site], fetch=fetch_open_meteo).current(site)
    assert report["provenance"] == "regional_model_estimate"
    assert report["wind_speed_mps"] == report["precipitation_mm"] == 0
    assert report["is_day"] is False
    assert report["visibility_m"] is None


def test_cache_is_per_site_and_expired_data_is_removed():
    a, b = main.site_registry[:2]
    calls = []
    now = 10

    def fetch(site):
        calls.append(site.site_id)
        if site == a and now >= 910:
            raise httpx.ConnectError("provider unavailable")
        return ProviderReading(time=1764191700, interval=900, temperature_2m=site.latitude)

    service = WeatherService([a, b], fetch=fetch, clock=lambda: now)
    assert service.current(a)["status"] == "current"
    assert service.current(a)["status"] == "current"
    assert service.current(b)["temperature_c"] != service.current(a)["temperature_c"]
    assert calls == [a.site_id, b.site_id]
    now = 910
    assert service.current(a)["status"] == "stale"
    now = 955
    assert service.current(a)["status"] == "stale"
    assert calls.count(a.site_id) == 2
    now = 3611
    with pytest.raises(WeatherUnavailable):
        service.current(a)
