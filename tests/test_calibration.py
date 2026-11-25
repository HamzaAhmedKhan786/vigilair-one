from pathlib import Path
from backend.calibration import load_calibrations

def test_planar_calibration_returns_metric_point():
    calibration=load_calibrations(Path("data/calibrations.json"))["CAM-01"]
    result=calibration.pixel_to_site(100,900)
    assert abs(result["position_m"][0]) < .01
    assert result["ground_plane_only"] is True
