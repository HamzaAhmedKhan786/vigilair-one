"""Geodesic helpers and conservative multi-site handoff scoring."""
import math
from .schemas import GeoPoint, HandoffRequest

EARTH_RADIUS_M = 6_371_008.8

def haversine_m(a: GeoPoint, b: GeoPoint) -> float:
    lat1,lat2=math.radians(a.latitude),math.radians(b.latitude); dlat=lat2-lat1; dlon=math.radians(b.longitude-a.longitude)
    h=math.sin(dlat/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    ground=2*EARTH_RADIUS_M*math.asin(min(1,math.sqrt(h)))
    return math.hypot(ground,b.altitude_m-a.altitude_m)

def bearing_deg(a: GeoPoint, b: GeoPoint) -> float:
    lat1,lat2=math.radians(a.latitude),math.radians(b.latitude); dlon=math.radians(b.longitude-a.longitude)
    y=math.sin(dlon)*math.cos(lat2); x=math.cos(lat1)*math.sin(lat2)-math.sin(lat1)*math.cos(lat2)*math.cos(dlon)
    return (math.degrees(math.atan2(y,x))+360)%360

def evaluate_handoff(request: HandoffRequest) -> dict:
    separation=haversine_m(request.last_position,request.candidate_position); required_speed=separation/request.elapsed_seconds
    feasible=required_speed<=request.max_speed_mps; appearance=request.appearance_similarity if request.appearance_similarity is not None else .5
    speed_score=max(0,1-required_speed/request.max_speed_mps); confidence=(.65*speed_score+.35*appearance) if feasible else 0
    return {"track_id":request.track_id,"from_site_id":request.from_site_id,"to_site_id":request.to_site_id,"distance_m":round(separation,2),"bearing_deg":round(bearing_deg(request.last_position,request.candidate_position),2),"required_speed_mps":round(required_speed,2),"handoff_feasible":feasible,"association_confidence":round(confidence,3),"human_review_required":True}
