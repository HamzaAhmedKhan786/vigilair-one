"""2D/3D geometry for site-relative tracking and path prediction."""
from __future__ import annotations
import math
from .schemas import Observation, OwnshipState, TrackAnalytics

def _xyz(values: list[float]) -> tuple[float, float, float]:
    return (float(values[0]), float(values[1]), float(values[2]) if len(values) > 2 else 0.0)

def distance(a: list[float], b: list[float]) -> float:
    ax, ay, az = _xyz(a); bx, by, bz = _xyz(b)
    return math.sqrt((bx-ax)**2 + (by-ay)**2 + (bz-az)**2)

def heading(a: list[float], b: list[float]) -> float:
    ax, ay, _ = _xyz(a); bx, by, _ = _xyz(b)
    return (math.degrees(math.atan2(bx-ax, by-ay)) + 360) % 360

def angle_delta(a: float, b: float) -> float:
    return (b - a + 180) % 360 - 180

def point_to_rect_distance(point: list[float], rect: tuple[float, float, float, float]) -> float:
    x, y, _ = _xyz(point); left, top, right, bottom = rect
    dx = max(left-x, 0, x-right); dy = max(top-y, 0, y-bottom)
    return math.hypot(dx, dy)

def has_loiter_window(points: list[tuple], minimum_seconds: float = 120, radius_m: float = 20) -> bool:
    for start in range(len(points)):
        for end in range(start + 1, len(points)):
            if (points[end][0] - points[start][0]).total_seconds() < minimum_seconds: continue
            anchor = points[start][1]
            if max(distance(anchor, points[index][1]) for index in range(start, end + 1)) <= radius_m: return True
    return False

def analyze_track(observations: list[Observation], restricted_zone_m: tuple[float,float,float,float], ownship: OwnshipState | None = None, prediction_seconds: int = 30, prediction_step: int = 5) -> TrackAnalytics:
    metric_observations = [o for o in observations if o.site_position_m is not None]
    points = [(o.timestamp, o.site_position_m) for o in metric_observations]
    if not points: raise ValueError("site_position_m is required for metric analytics")
    positions = [p for _, p in points]
    path_length = sum(distance(a, b) for a, b in zip(positions, positions[1:]))
    elapsed = max((points[-1][0] - points[0][0]).total_seconds(), 0.001)
    displacement = distance(positions[0], positions[-1])
    current_speed = metric_observations[-1].speed_mps
    current_heading = heading(positions[-2], positions[-1]) if len(positions) >= 2 else metric_observations[-1].heading_deg
    acceleration = 0.0; turn_rate = 0.0
    if len(points) >= 2:
        dt = max((points[-1][0] - points[-2][0]).total_seconds(), 0.001)
        acceleration = (metric_observations[-1].speed_mps - metric_observations[-2].speed_mps) / dt
        previous_heading = heading(positions[-3], positions[-2]) if len(positions) >= 3 else metric_observations[-2].heading_deg
        turn_rate = angle_delta(previous_heading, current_heading) / dt
    zone_distance = point_to_rect_distance(positions[-1], restricted_zone_m)
    eta = zone_distance / current_speed if current_speed > 0.2 else None
    x, y, z = _xyz(positions[-1]); radians = math.radians(current_heading)
    velocity = (math.sin(radians)*current_speed, math.cos(radians)*current_speed, 0.0)
    predicted = [[round(x+velocity[0]*t,2), round(y+velocity[1]*t,2), round(z,2)] for t in range(prediction_step, prediction_seconds+1, prediction_step)]
    behaviors = []
    if has_loiter_window(points): behaviors.append("loitering")
    if eta is not None and eta <= 60: behaviors.append("approaching_restricted_zone")
    if abs(turn_rate) >= 5: behaviors.append("abrupt_direction_change")
    if current_speed < 0.8: behaviors.append("hovering_or_stationary")
    own_distance = cpa_distance = cpa_time = None
    if ownship is not None:
        own_position = list(_xyz(ownship.position_m)); own_velocity = list(_xyz(ownship.velocity_mps))
        own_distance = distance(positions[-1], own_position)
        rx, ry, rz = x-own_position[0], y-own_position[1], z-own_position[2]
        rvx, rvy, rvz = velocity[0]-own_velocity[0], velocity[1]-own_velocity[1], velocity[2]-own_velocity[2]
        rv2 = rvx*rvx+rvy*rvy+rvz*rvz
        cpa_time = max(0.0, min(300.0, -(rx*rvx+ry*rvy+rz*rvz)/rv2)) if rv2 > 1e-9 else 0.0
        cpa_distance = math.sqrt((rx+rvx*cpa_time)**2+(ry+rvy*cpa_time)**2+(rz+rvz*cpa_time)**2)
    return TrackAnalytics(track_id=metric_observations[-1].track_id, path_length_m=round(path_length,2), displacement_m=round(displacement,2), current_speed_mps=current_speed, average_speed_mps=round(path_length/elapsed,2), heading_deg=round(current_heading,2), acceleration_mps2=round(acceleration,3), turn_rate_deg_s=round(turn_rate,3), dwell_seconds=elapsed, distance_to_restricted_zone_m=round(zone_distance,2), eta_to_restricted_zone_s=round(eta,2) if eta is not None else None, distance_to_ownship_m=round(own_distance,2) if own_distance is not None else None, closest_approach_m=round(cpa_distance,2) if cpa_distance is not None else None, closest_approach_seconds=round(cpa_time,2) if cpa_time is not None else None, behaviors=behaviors, predicted_path_m=predicted)
