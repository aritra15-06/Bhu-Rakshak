from fastapi import APIRouter
from backend.models.location_state import list_all_locations

router = APIRouter()


@router.get("/locations")
def get_locations():
    locations = list_all_locations()
    return {"locations": locations, "count": len(locations)}
