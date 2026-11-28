"""Deterministic fictional hex zones and independent synthetic track truth."""

import json
import math
from pathlib import Path

from backend.geospatial import bearing_deg, haversine_m
from backend.schemas import GeoPoint
from .hex_grid import adjacency, containing_zone, grid


def scenario(config_path: Path) -> dict:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    rows, columns = int(config["rows"]), int(config["columns"])
    if rows * columns != int(config["site_count"]) or not 24 <= rows * columns <= 35:
        raise ValueError("Research grid must contain 24 to 35 sites")
    if not 0 < float(config["hex_radius_deg"]) < 0.02:
        raise ValueError("Invalid fictional hex radius")
    radius = float(config["hex_radius_deg"])
    centers, features = grid(rows, columns, radius, float(config["origin_lon"]), float(config["origin_lat"]))
    neighbors = adjacency(centers, radius)
    visible = config["default_visible"]
    if len(visible) not in (3, 4) or any(item not in centers for item in visible):
        raise ValueError("Default research view requires 3 or 4 sites")
    # Metric truth is defined first in a local, independent synthetic plane.
    # Geodetic positions are derived separately and compared with haversine.
    if any(b not in neighbors[a] for a, b in zip(visible, visible[1:])):
        raise ValueError("Default research sites must form a connected hex route")
    start = centers[visible[0]]
    observations = []
    for index in range(31):
        segment = min(index // 10, 2)
        fraction = (index - segment * 10) / 10
        a, b = centers[visible[segment]], centers[visible[segment + 1]]
        lon = a[0] + fraction * (b[0] - a[0])
        lat = a[1] + fraction * (b[1] - a[1])
        east_m = (lon - start[0]) * 111_320 * math.cos(math.radians(start[1]))
        north_m = (lat - start[1]) * 110_574
        nearest = containing_zone(centers, (lon, lat), radius)
        if nearest is None:
            raise ValueError("Synthetic route left the fictional hex grid")
        observations.append({"step": index, "elapsed_ms": index * 10_000,
                             "timestamp": f"T+{index * 10:03d}s", "track_id": "SYN-HEX-01",
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
    # The first frame has no observed velocity. Use a clearly identified seeded
    # demo heading; all later estimates use only the current and previous frame.
    observations[0]["heading_deg"] = observations[1]["heading_deg"]
    observations[0]["speed_mps"] = observations[1]["speed_mps"]
    observations[0]["prediction_source"] = "seeded_synthetic_route"
    for index, item in enumerate(observations):
        previous = observations[max(0, index - 1)]
        if index:
            east_per_step = item["longitude"] - previous["longitude"]
            north_per_step = item["latitude"] - previous["latitude"]
        else:
            east_per_step = observations[1]["longitude"] - item["longitude"]
            north_per_step = observations[1]["latitude"] - item["latitude"]
        if index:
            item["prediction_source"] = "constant_velocity_from_past_observations"
        points = [[item["longitude"], item["latitude"]]]
        predicted = []
        for horizon in (20, 40, 60, 80):
            point = (round(item["longitude"] + east_per_step * horizon / 10, 7),
                     round(item["latitude"] + north_per_step * horizon / 10, 7))
            points.append(list(point))
            predicted_site = containing_zone(centers, point, radius)
            if predicted_site and predicted_site != item["site_id"] and predicted_site not in predicted:
                predicted.append(predicted_site)
        item["prediction"] = {"source": item["prediction_source"], "estimated": True,
                              "horizon_s": 80, "heading_deg": item["heading_deg"],
                              "coordinates": points, "next_zone_ids": predicted[:2]}
        item["active_neighbor_ids"] = sorted(site_id for site_id in neighbors[item["site_id"]]
                                              if math.dist(centers[site_id], (item["longitude"], item["latitude"])) <= radius * 1.65)
        prior_site = previous["site_id"] if index else None
        recently_received = prior_site != item["site_id"] and prior_site in neighbors[item["site_id"]] if prior_site else False
        if recently_received:
            item["handoff_phase"] = "active_handoff"
        elif index > 0 and observations[index - 1].get("handoff_phase") == "active_handoff":
            item["handoff_phase"] = "received"
        elif any(site_id in neighbors[item["site_id"]] for site_id in predicted):
            item["handoff_phase"] = "predicted_handoff"
        else:
            item["handoff_phase"] = "monitoring"
        item["zone_states"] = {site_id: {"state": "tracked" if site_id == item["site_id"] else
                                         "predicted_next" if site_id in predicted else
                                         "watch" if site_id in item["active_neighbor_ids"] else "inactive",
                                         "operational_state": ("receiving_handoff" if item["handoff_phase"] in ("active_handoff", "received") else "active") if site_id == item["site_id"] else
                                         "alerted" if site_id in predicted else "active" if site_id in item["active_neighbor_ids"] else "normal",
                                         "handoff": item["handoff_phase"] if site_id == item["site_id"] else
                                         "predicted_handoff" if site_id in predicted else "monitoring"}
                               for site_id in centers}
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
                       "longitude": point[0], "latitude": point[1], "neighbors": neighbors[key]} for key, point in centers.items()],
            "zones": {"type": "FeatureCollection", "features": list(features.values())}, "observations": observations,
            "activation_events": activation_events,
            "validation": {"distance_mae_m": round(sum(distance_errors) / len(distance_errors), 3),
                           "distance_rmse_m": round(math.sqrt(sum(error ** 2 for error in distance_errors) / len(distance_errors)), 3),
                           "circular_heading_mae_deg": round(sum(heading_errors) / len(heading_errors), 3),
                           "sample_count": len(distance_errors), "truth_source": "independent_local_metric_plane"}}
