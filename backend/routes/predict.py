from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

from backend.models.location_state import get_current_params
from backend.prediction_bridge import predict_from_params

router = APIRouter()


class PredictRequest(BaseModel):
    location_id: str


@router.post("/predict")
def predict(body: PredictRequest, request: Request):
    try:
        params = get_current_params(body.location_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown location_id: {body.location_id}")

    service = request.app.state.prediction_service
    result = predict_from_params(service, body.location_id, params)
    return result
