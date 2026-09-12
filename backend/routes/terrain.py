"""
OpenTopography Real DEM Terrain Integration Router.

Endpoints:
- GET /api/terrain/provenance: Inspect active DEM metadata, OpenTopography API status, elevation stats.
- POST /api/terrain/fetch: Fetch fresh elevation grid from OpenTopography API.
"""

from __future__ import annotations

import os
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from backend import config
from terrain3d.fetch_dem import fetch_and_build_dem, REPO_ROOT

router = APIRouter(tags=["terrain"])

HEIGHTMAP_FILE = os.path.join(REPO_ROOT, "terrain3d", "heightmaps", "north_sikkim_region_heightmap.json")


class FetchDemRequest(BaseModel):
    api_key: Optional[str] = None
    grid_size: int = 128


@router.get("/terrain/provenance")
def get_terrain_provenance():
    if not os.path.exists(HEIGHTMAP_FILE):
        return {
            "status": "unavailable",
            "message": "Heightmap has not been generated yet.",
            "opentopography_configured": config.OPENTOPOGRAPHY_CONFIGURED,
        }

    try:
        with open(HEIGHTMAP_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)

        return {
            "status": "active",
            "data_provenance": data.get("data_provenance", "REAL DEM data from OpenTopography"),
            "api_provider": data.get("api_provider", "OpenTopography Global DEM API"),
            "dem_type": data.get("dem_type", "SRTMGL1"),
            "resolution_m": data.get("resolution_m", 30),
            "grid_size": data.get("grid_size", 128),
            "bounds": data.get("bounds", {}),
            "elevation_min_m": data.get("elevation_min_m"),
            "elevation_max_m": data.get("elevation_max_m"),
            "total_grid_points": len(data.get("heights", [])),
            "site_markers_count": len(data.get("site_markers", [])),
            "opentopography_configured": config.OPENTOPOGRAPHY_CONFIGURED,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read terrain heightmap: {e}")


@router.post("/terrain/fetch")
def trigger_fetch_dem(req: FetchDemRequest):
    key = req.api_key or config.OPENTOPOGRAPHY_API_KEY
    if not key:
        raise HTTPException(status_code=400, detail="No OpenTopography API key configured or provided.")

    try:
        heightmap = fetch_and_build_dem(api_key=key, grid_size=req.grid_size)
        return {
            "success": True,
            "message": "Successfully fetched and built real DEM from OpenTopography API.",
            "dem_type": heightmap.get("dem_type"),
            "resolution_m": heightmap.get("resolution_m"),
            "elevation_min_m": heightmap.get("elevation_min_m"),
            "elevation_max_m": heightmap.get("elevation_max_m"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OpenTopography API fetch failed: {e}")
