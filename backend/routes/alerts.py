from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from backend.models.contacts_store import add_contact, list_contacts, delete_contact
from backend.models.location_state import get_current_params
from backend.prediction_bridge import predict_from_params
from alerts.dispatch import run_alert_cycle
from alerts.language_templates import SUPPORTED_LANGUAGES
from backend import config

router = APIRouter()


class ContactCreate(BaseModel):
    name: str
    phone_number: str
    latitude: float
    longitude: float
    preferred_language: str = "en"
    town: str = "Chungthang Town"


@router.get("/contacts")
def get_contacts():
    return {"contacts": list_contacts(), "supported_languages": SUPPORTED_LANGUAGES,
            "twilio_configured": config.TWILIO_CONFIGURED}


@router.post("/contacts")
def create_contact(body: ContactCreate):
    if body.preferred_language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"unsupported language, choose from {SUPPORTED_LANGUAGES}")
    contact = add_contact(
        name=body.name, phone_number=body.phone_number,
        latitude=body.latitude, longitude=body.longitude,
        preferred_language=body.preferred_language,
        town=body.town,
    )
    return contact


@router.delete("/contacts/{contact_id}")
def remove_contact(contact_id: str):
    ok = delete_contact(contact_id)
    if not ok:
        raise HTTPException(status_code=404, detail="unknown contact_id")
    return {"deleted": True, "contact_id": contact_id}


class AlertSendRequest(BaseModel):
    location_id: str
    dry_run: bool = True


@router.post("/alerts/send")
def send_alerts(body: AlertSendRequest, request: Request):
    try:
        params = get_current_params(body.location_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown location_id: {body.location_id}")

    if body.dry_run is False:
        from alerts.free_alert_dispatcher import load_free_alert_settings
        free_settings = load_free_alert_settings()
        prov = free_settings.get("active_provider", "telegram")
        if prov == "telegram" and not (free_settings.get("telegram_bot_token") and free_settings.get("telegram_chat_id")):
            raise HTTPException(
                status_code=400,
                detail="Telegram is selected as active alert provider, but Bot Token or Chat ID is not configured yet. Set them up in the Settings modal or switch to Simulated Free Broadcast.",
            )
        elif prov == "fast2sms" and not free_settings.get("fast2sms_api_key"):
            raise HTTPException(
                status_code=400,
                detail="Fast2SMS is selected as active alert provider, but API Key is missing. Set it up in Settings or switch to Telegram/Simulated Free Broadcast.",
            )
        elif prov == "twilio" and not config.TWILIO_CONFIGURED:
            raise HTTPException(
                status_code=400,
                detail="Twilio credentials are not set. Please use the free Telegram bot or simulated broadcast.",
            )

    service = request.app.state.prediction_service
    bridge_result = predict_from_params(service, body.location_id, params)

    contacts = list_contacts()
    env_features = bridge_result["environmental_features_used"]
    env_features["slip_depth_m"] = params["slip_depth_m"]
    env_features["slope_deg"] = params["slope_deg"]

    alert_result = run_alert_cycle(
        prediction_json=bridge_result["prediction"],
        environmental_features=env_features,
        contacts=contacts,
        dry_run=body.dry_run,
    )
    return alert_result
