"""Planar camera-to-site calibration for ground-plane coordinates.

This cannot recover reliable altitude from one monocular camera. Use stereo,
radar, depth, or a documented size prior for 3D range.
"""
import json
from pathlib import Path
import numpy as np

class PlanarCalibration:
    def __init__(self, camera_id: str, image_points: list[list[float]], site_points_m: list[list[float]], uncertainty_m: float = 5.0):
        if len(image_points) < 4 or len(image_points) != len(site_points_m): raise ValueError("at least four matched image/site points are required")
        self.camera_id = camera_id; self.uncertainty_m = uncertainty_m
        rows=[]; targets=[]
        for (u,v),(x,y) in zip(image_points,site_points_m):
            rows.append([u,v,1,0,0,0,-u*x,-v*x]); targets.append(x)
            rows.append([0,0,0,u,v,1,-u*y,-v*y]); targets.append(y)
        solution, *_ = np.linalg.lstsq(np.asarray(rows,dtype=float),np.asarray(targets,dtype=float),rcond=None)
        self.matrix = np.append(solution,1.0).reshape(3,3)

    def pixel_to_site(self, x: float, y: float) -> dict:
        projected=self.matrix@np.asarray([x,y,1.0],dtype=float)
        if abs(projected[2]) < 1e-9: raise ValueError("point projects to infinity")
        result=projected[:2]/projected[2]
        return {"camera_id":self.camera_id,"position_m":[round(float(result[0]),3),round(float(result[1]),3)],"uncertainty_m":self.uncertainty_m,"ground_plane_only":True}

def load_calibrations(path: Path) -> dict[str, PlanarCalibration]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return {item["camera_id"]:PlanarCalibration(**item) for item in payload["calibrations"]}
