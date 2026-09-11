from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from gis.impact_engine import get_impact, DEFAULT_BUFFER_M

router = APIRouter()


@router.get("/impact")
def impact_point(
    latitude: float = Query(..., description="Latitude coordinate"),
    longitude: float = Query(..., description="Longitude coordinate"),
    buffer_m: float = Query(default=DEFAULT_BUFFER_M),
):
    result = get_impact(latitude=latitude, longitude=longitude, buffer_m=buffer_m)
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/impact/{location_id}")
def impact(
    location_id: str,
    buffer_m: float = Query(default=DEFAULT_BUFFER_M),
    latitude: Optional[float] = Query(default=None),
    longitude: Optional[float] = Query(default=None),
):
    result = get_impact(location_id=location_id, latitude=latitude, longitude=longitude, buffer_m=buffer_m)
    if result.get("error"):
        raise HTTPException(status_code=404, detail=result["error"])
    return result
