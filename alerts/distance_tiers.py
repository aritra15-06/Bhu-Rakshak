"""
Distance-tiered contact classification: Dynamic Settlement & Range Analysis.

Dynamically classifies contacts relative to hazard coordinates without any
preset lookup tables or hardcoded site associations.
"""

from __future__ import annotations

from geopy.distance import geodesic
from typing import Optional, List, Dict, Any
from gis.impact_engine import get_impact


def classify_contacts(
    hazard_latitude: float,
    hazard_longitude: float,
    contacts: list,
    hazard_location_id: Optional[str] = None,
    affected_towns: Optional[List[str]] = None,
) -> list:
    """
    Returns [{"contact": c, "tier": str, "distance_m": float}, ...]
    Classifies dynamically into:
    - EVACUATE_NOW: within 2500m OR registered in a directly affected settlement
    - PREPARE: within 5000m buffer
    - TRANSIT_DETOUR_ADVISORY: farther contacts / travelers along connecting corridors
    """
    target_towns = set(affected_towns or [])

    # If affected_towns not explicitly supplied, dynamically query the GIS impact engine
    if not target_towns:
        impact = get_impact(location_id=hazard_location_id, latitude=hazard_latitude, longitude=hazard_longitude, buffer_m=2000.0)
        for v in impact.get("affected_villages", []):
            target_towns.add(v["name"].lower())
        if impact.get("nearest_town"):
            target_towns.add(impact["nearest_town"]["name"].lower())

    results = []
    for c in contacts:
        dist_m = geodesic((hazard_latitude, hazard_longitude), (c["latitude"], c["longitude"])).meters
        c_town = (c.get("town") or "").lower()

        # Check dynamic town match
        is_direct_town = any(t in c_town or c_town in t for t in target_towns) if (c_town and target_towns) else False

        if dist_m <= 2500.0 or is_direct_town:
            tier = "EVACUATE_NOW"
        elif dist_m <= 5000.0:
            tier = "PREPARE"
        else:
            tier = "TRANSIT_DETOUR_ADVISORY"

        results.append({"contact": c, "tier": tier, "distance_m": round(dist_m, 1)})
    return results
