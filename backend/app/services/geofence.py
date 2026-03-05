import math
from typing import Sequence


def haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return distance in meters between two lat/lng points."""
    R = 6_371_000  # Earth radius in metres
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def is_within_any_work_center(lat: float, lng: float, work_centers: Sequence) -> bool:
    """Return True if the given point is within the radius of at least one work center."""
    for wc in work_centers:
        if haversine_meters(lat, lng, wc.lat, wc.lng) <= wc.radius_meters:
            return True
    return False
