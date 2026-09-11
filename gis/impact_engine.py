"""
Impact Engine: Real-Time Dynamic GIS Analysis Engine.

Performs vector distance and intersection queries between hazard coordinates
and actual Sikkim road centerlines and settlement points using Shapely and
pyproj (local Azimuthal Equidistant projection).

Calculates nearest roads, transport corridors, and nearby settlements dynamically
without any hardcoded lookup tables or preset associations.
"""

from __future__ import annotations

import json
import os
from typing import Optional, List, Dict, Any
from shapely.geometry import Point, LineString
from shapely.ops import transform
import pyproj

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_BUFFER_M = 500.0


def _load_seed_data():
    villages_path = os.path.join(REPO_ROOT, "gis", "seed_data", "villages_demo.json")
    roads_path = os.path.join(REPO_ROOT, "gis", "seed_data", "roads_demo.json")
    locations_path = os.path.join(REPO_ROOT, "demo", "pilot_locations.json")

    with open(villages_path, "r", encoding="utf-8") as f:
        v_raw = json.load(f)
        villages = v_raw.get("villages", []) if isinstance(v_raw, dict) else v_raw
    with open(roads_path, "r", encoding="utf-8") as f:
        r_raw = json.load(f)
        roads = r_raw.get("roads", []) if isinstance(r_raw, dict) else r_raw
    with open(locations_path, "r", encoding="utf-8") as f:
        loc_raw = json.load(f)
        locations = loc_raw.get("locations", []) if isinstance(loc_raw, dict) else loc_raw
    return villages, roads, {loc["location_id"]: loc for loc in locations}


def _meters_transformer(lat_ref: float, lon_ref: float):
    """Local azimuthal equidistant projection centered on the hazard point,
    so buffer distances in meters are locally accurate without distortion."""
    proj_str = f"+proj=aeqd +lat_0={lat_ref} +lon_0={lon_ref} +units=m +ellps=WGS84"
    aeqd = pyproj.CRS.from_proj4(proj_str)
    wgs84 = pyproj.CRS("EPSG:4326")
    return pyproj.Transformer.from_crs(wgs84, aeqd, always_xy=True).transform


def get_impact(
    location_id: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    buffer_m: float = DEFAULT_BUFFER_M,
) -> Dict[str, Any]:
    """
    Dynamically computes affected and nearest settlements and road corridors
    for any hazard point in North/East Sikkim strictly from vector geometry.
    Accepts either (latitude, longitude) directly or a known location_id.
    """
    villages, roads, locations_by_id = _load_seed_data()

    # Resolve coordinates
    if latitude is None or longitude is None:
        if location_id and location_id in locations_by_id:
            loc = locations_by_id[location_id]
            latitude = loc["latitude"]
            longitude = loc["longitude"]
        else:
            return {
                "location_id": location_id,
                "error": f"Coordinates not provided and unknown location_id: {location_id}",
                "affected_villages": [],
                "affected_roads": [],
                "nearby_towns": [],
                "nearest_road": None,
                "nearest_town": None,
                "primary_road_corridor": "Local Slope Access Route",
                "nearest_landmark": "Mountain slope corridor",
            }

    hazard_point = Point(longitude, latitude)
    to_meters = _meters_transformer(latitude, longitude)
    hazard_point_m = transform(to_meters, hazard_point)
    buffer_m_geom = hazard_point_m.buffer(buffer_m)

    # 1. Settlements Discovery (Dynamic Geodesic & Planar Distance)
    settlements_evaluated = []
    for v in villages:
        vpoint_m = transform(to_meters, Point(v["longitude"], v["latitude"]))
        dist_m = float(hazard_point_m.distance(vpoint_m))
        dist_km = round(dist_m / 1000.0, 2)
        settlements_evaluated.append({
            "id": v["id"],
            "name": v["name"],
            "population": v.get("population", 0),
            "latitude": v["latitude"],
            "longitude": v["longitude"],
            "distance_m": round(dist_m, 1),
            "distance_km": dist_km,
            "in_direct_buffer": bool(buffer_m_geom.intersects(vpoint_m)),
        })

    # Sort settlements by distance ascending
    settlements_evaluated.sort(key=lambda s: s["distance_m"])
    nearest_town = settlements_evaluated[0] if settlements_evaluated else None
    nearby_towns = settlements_evaluated[:6]

    # Affected settlements: in direct buffer or within 2.5km hazard influence
    affected_villages = [
        s for s in settlements_evaluated
        if s["in_direct_buffer"] or s["distance_m"] <= max(buffer_m, 2500.0)
    ]
    if not affected_villages and nearest_town:
        affected_villages = [nearest_town]

    # 2. Roads & Corridor Discovery (Dynamic Point-to-Line Projection)
    roads_evaluated = []
    road_features = []

    for r in roads:
        line_coords = r.get("coordinates") or r.get("geometry", {}).get("coordinates")
        if not line_coords or len(line_coords) < 2:
            continue
        road_class = r.get("road_class") or r.get("category", "state_highway")
        line_m = transform(to_meters, LineString(line_coords))
        dist_to_road_m = float(hazard_point_m.distance(line_m))
        intersects = buffer_m_geom.intersects(line_m)

        # Dynamic corridor endpoints based on closest settlements to line start & end
        start_p_m = transform(to_meters, Point(line_coords[0][0], line_coords[0][1]))
        end_p_m = transform(to_meters, Point(line_coords[-1][0], line_coords[-1][1]))

        start_near = min(
            villages,
            key=lambda v: start_p_m.distance(transform(to_meters, Point(v["longitude"], v["latitude"])))
        )
        end_near = min(
            villages,
            key=lambda v: end_p_m.distance(transform(to_meters, Point(v["longitude"], v["latitude"])))
        )

        corridor_desc = f"{r['name']} (connecting {start_near['name']} & {end_near['name']})"

        road_entry = {
            "id": r["id"],
            "name": r["name"],
            "road_class": road_class,
            "distance_m": round(dist_to_road_m, 1),
            "distance_km": round(dist_to_road_m / 1000.0, 2),
            "corridor_description": corridor_desc,
            "endpoints": [start_near["name"], end_near["name"]],
            "intersects_hazard_zone": bool(intersects),
            "coordinates": line_coords,
        }
        roads_evaluated.append(road_entry)

        if intersects or dist_to_road_m <= max(buffer_m, 500.0):
            road_features.append({
                "type": "Feature",
                "properties": {
                    "id": r["id"],
                    "name": r["name"],
                    "road_class": road_class,
                    "corridor": corridor_desc,
                    "distance_m": round(dist_to_road_m, 1),
                },
                "geometry": {"type": "LineString", "coordinates": line_coords},
            })

    # Sort roads by distance to hazard point
    roads_evaluated.sort(key=lambda r: r["distance_m"])
    nearest_road = roads_evaluated[0] if roads_evaluated else None

    # Determine affected roads list
    affected_roads = [
        r for r in roads_evaluated
        if r["intersects_hazard_zone"] or r["distance_m"] <= max(buffer_m, 1000.0)
    ]
    if not affected_roads and nearest_road:
        affected_roads = [nearest_road]

    # Primary road corridor description
    if nearest_road:
        if nearest_road["distance_m"] < 150.0:
            primary_road_corridor = nearest_road["corridor_description"]
        else:
            primary_road_corridor = f"{nearest_road['name']} corridor ({int(nearest_road['distance_m'])}m from slope)"
    else:
        primary_road_corridor = "Local Slope Access Route"

    nearest_landmark_str = (
        f"{nearest_town['distance_km']} km from {nearest_town['name']}"
        if nearest_town else "Mountain slope corridor"
    )

    return {
        "location_id": location_id,
        "query_coordinates": {"latitude": latitude, "longitude": longitude},
        "buffer_m": buffer_m,
        "nearest_road": nearest_road,
        "affected_roads": affected_roads,
        "primary_road_corridor": primary_road_corridor,
        "nearest_town": nearest_town,
        "nearby_towns": nearby_towns,
        "affected_villages": affected_villages,
        "nearest_landmark": nearest_landmark_str,
        "affected_roads_geojson": {"type": "FeatureCollection", "features": road_features},
        "total_affected_population": sum(v["population"] for v in affected_villages),
        "computation_note": "Real-time vector GIS computation via Shapely + Azimuthal Equidistant projection.",
    }
