"""Deterministic fictional hex zones and independent synthetic track truth."""

import json
import math
from pathlib import Path

from backend.geospatial import bearing_deg, haversine_m
from backend.schemas import GeoPoint


def scenario(config_path: Path) -> dict:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    rows, columns = int(config["rows"]), int(config["columns"])
    if rows * columns != int(config["site_count"]) or not 24 <= rows * columns <= 35:
        raise ValueError("Research grid must contain 24 to 35 sites")
    if not 0 < float(config["hex_radius_deg"]) < 0.02:
        raise ValueError("Invalid fictional hex radius")
    features = []
    centers = {}
    for row in range(rows):
        for col in range(columns):
            index = row * columns + col + 1
            site_id = f"FIC-{index:02d}"
            lon = float(config["origin_lon"]) + col * float(config["spacing_lon"]) + (row % 2) * float(config["spacing_lon"]) / 2
            lat = float(config["origin_lat"]) + row * float(config["spacing_lat"])
            centers[site_id] = (lon, lat)
            radius = float(config["hex_radius_deg"])
            vertices = [[lon + radius * math.cos(math.radians(60 * angle)),
                         lat + radius * math.sin(math.radians(60 * angle))] for angle in range(7)]
            features.append({"type": "Feature", "id": site_id,
                             "properties": {"site_id": site_id, "name": f"Fictional sector {index:02d}",
                                            "fictional": True, "row": row, "column": col},
                             "geometry": {"type": "Polygon", "coordinates": [vertices]}})
    visible = config["default_visible"]
    if len(visible) not in (3, 4) or any(item not in centers for item in visible):
        raise ValueError("Default research view requires 3 or 4 sites")
    # Metric truth is defined first in a local, independent synthetic plane.
    # Geodetic positions are derived separately and compared with haversine.
    start = centers[visible[0]]
    end = centers[visible[-1]]
    observations = []
    for index in range(31):
        fraction = index / 30
        lon = start[0] + fraction * (end[0] - start[0])
        lat = start[1] + fraction * (end[1] - start[1]) + 0.0015 * math.sin(2 * math.pi * fraction)
        east_m = (lon - start[0]) * 111_320 * math.cos(math.radians(start[1]))
        north_m = (lat - start[1]) * 110_574
        nearest = min(visible, key=lambda item: (centers[item][0] - lon) ** 2 + (centers[item][1] - lat) ** 2)
        observations.append({"step": index, "elapsed_ms": index * 10_000,
                             "site_id": nearest, "latitude": round(lat, 7), "longitude": round(lon, 7),
                             "altitude_m": round(28 + 4 * math.sin(math.pi * fraction), 2),
                             "truth_east_m": east_m, "truth_north_m": north_m,
                             "position_uncertainty_m": 5.0 + index * 0.1,
                             "source": "synthetic_ground_truth"})
    distance_errors, heading_errors = [], []
    for previous, current in zip(observations, observations[1:]):
        a = GeoPoint(latitude=previous["latitude"], longitude=previous["longitude"], altitude_m=previous["altitude_m"])
        b = GeoPoint(latitude=current["latitude"], longitude=current["longitude"], altitude_m=current["altitude_m"])
        truth_distance = math.hypot(current["truth_east_m"] - previous["truth_east_m"],
                                    current["truth_north_m"] - previous["truth_north_m"],
                                    current["altitude_m"] - previous["altitude_m"])
        calculated = haversine_m(a, b)
        distance_errors.append(abs(calculated - truth_distance))
        truth_heading = (math.degrees(math.atan2(current["truth_east_m"] - previous["truth_east_m"],
                                                  current["truth_north_m"] - previous["truth_north_m"])) + 360) % 360
        calculated_heading = bearing_deg(a, b)
        heading_errors.append(abs((calculated_heading - truth_heading + 180) % 360 - 180))
        current["distance_from_previous_m"] = round(calculated, 2)
        current["speed_mps"] = round(calculated / 10, 2)
        current["heading_deg"] = round(calculated_heading, 2)
    for item in observations:
        item.pop("truth_east_m")
        item.pop("truth_north_m")
    activation_events = [
        {"step": 4, "elapsed_ms": 40_000, "kind": "simulated_acoustic_cue",
         "description": "Predefined microphone cue; visual evidence review is suggested, not activated."},
        {"step": 12, "elapsed_ms": 120_000, "kind": "simulated_visual_review",
         "description": "Predefined image review point; no detector prediction is attached."},
        {"step": 23, "elapsed_ms": 230_000, "kind": "simulated_zone_transition",
         "description": "Synthetic track changes fictional sectors; human review remains required."},
    ]
    return {"scenario_id": config["scenario_id"], "source": "synthetic", "coordinate_note": config["coordinate_system"],
            "refresh_interval_ms": 200, "default_visible": visible,
            "sites": [{"site_id": key, "name": f"Fictional sector {int(key[-2:]):02d}",
                       "longitude": point[0], "latitude": point[1]} for key, point in centers.items()],
            "zones": {"type": "FeatureCollection", "features": features}, "observations": observations,
            "activation_events": activation_events,
            "validation": {"distance_mae_m": round(sum(distance_errors) / len(distance_errors), 3),
                           "distance_rmse_m": round(math.sqrt(sum(error ** 2 for error in distance_errors) / len(distance_errors)), 3),
                           "circular_heading_mae_deg": round(sum(heading_errors) / len(heading_errors), 3),
                           "sample_count": len(distance_errors), "truth_source": "independent_local_metric_plane"}}
