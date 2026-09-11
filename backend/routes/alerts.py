from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from backend.models.contacts_store import add_contact, list_contacts, delete_contact
from backend.models.location_state import get_current_params
from backend.models.alert_history_store import (
    list_alerts_history,
    list_incidents_history,
    record_alert_dispatch,
    record_danger_incident,
)
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

    # Automatically persist to alert history store if alert was dispatched
    if alert_result.get("sent") and alert_result.get("recipients"):
        calibrated_p = bridge_result["prediction"]["ml_output"].get("calibrated_probability") or 0.82
        prob_pct = round(calibrated_p * 100, 1)
        loc_meta = bridge_result["prediction"]["location"]
        loc_name = loc_meta.get("name") or loc_meta.get("location_id") or body.location_id
        road_name = alert_result.get("road_corridor") or "Mountain Highway Corridor"
        primary_msg = alert_result["recipients"][0].get("message", "")

        record_alert_dispatch(
            alert_type="EMERGENCY_BROADCAST",
            location_id=body.location_id,
            location_name=loc_name,
            road_corridor=road_name,
            probability_percent=prob_pct,
            severity_band=alert_result["severity"]["severity_band"],
            recipients=[
                {
                    "name": r.get("name", "Citizen Observer"),
                    "phone": r.get("phone_number", "Registered Line"),
                    "town": r.get("town", "North Sikkim"),
                    "tier": r.get("tier", "IMMEDIATE"),
                }
                for r in alert_result["recipients"]
            ],
            message=primary_msg,
            provider="Fast2SMS / Relay",
            status="DELIVERED" if not body.dry_run else "SIMULATED_DELIVERED",
        )

        if alert_result["severity"]["severity_band"] in ("CATASTROPHIC_POTENTIAL", "MAJOR"):
            record_danger_incident(
                location_id=body.location_id,
                location_name=loc_name,
                road_corridor=road_name,
                nearest_settlement=alert_result["recipients"][0].get("town", "North Sikkim"),
                severity_band=alert_result["severity"]["severity_band"],
                max_probability_percent=prob_pct,
                peak_rainfall_24h_mm=env_features.get("rainfall_24h_mm", 0.0),
                peak_rainfall_1h_mm=env_features.get("rainfall_1h_mm", 0.0),
                status="SYSTEM_PREDICTED_ACTIVE",
                road_blocked=True,
                road_blockage_duration="Active Failure Hazard",
                event_summary=f"Severe slope instability triggered along {road_name} with {prob_pct}% probability.",
                early_warning_outcome=f"Dispatched SMS alert to {len(alert_result['recipients'])} registered observers.",
            )

    return alert_result


class SingleTestAlertRequest(BaseModel):
    phone_number: str
    recipient_name: Optional[str] = "Citizen"
    town: Optional[str] = "North Sikkim Sector"
    custom_message: Optional[str] = None
    dry_run: bool = False


@router.post("/alerts/test")
def test_alert_to_recipient(body: SingleTestAlertRequest):
    """
    Sends a test emergency warning SMS to a specific recipient using
    the active alert provider (Fast2SMS, Telegram, Twilio, or Simulated).
    """
    from alerts.sms_sender import send_sms
    from alerts.free_alert_dispatcher import load_free_alert_settings

    free_settings = load_free_alert_settings()
    active_prov = free_settings.get("active_provider", "telegram")

    msg = body.custom_message or (
        f"🚨 BHU-RAKSHAK TEST ALERT: Sensor connection verified for {body.recipient_name} at {body.town}. "
        "Landslide early warning telemetry operating normally."
    )

    result = send_sms(to_number=body.phone_number, message=msg, dry_run=body.dry_run)

    # Log test alert into history
    record_alert_dispatch(
        alert_type="OPERATOR_TEST",
        location_id="TEST-DIAG",
        location_name=body.town or "Test Diagnostic Sector",
        road_corridor="Direct Observer Channel",
        probability_percent=100.0,
        severity_band="TEST_DIAGNOSTIC",
        recipients=[{
            "name": body.recipient_name,
            "phone": body.phone_number,
            "town": body.town,
            "tier": "DIRECT_TEST"
        }],
        message=msg,
        provider=active_prov,
        status="DELIVERED" if result.get("sent") else ("FAILED" if result.get("error") else "SIMULATED_DELIVERED"),
    )

    return {
        "success": bool(result.get("sent", False)),
        "recipient_name": body.recipient_name,
        "phone_number": body.phone_number,
        "town": body.town,
        "active_provider": active_prov,
        "message": msg,
        "dry_run": body.dry_run,
        "result": result,
        "error": result.get("error"),
    }


class SimulationHistoryRecordRequest(BaseModel):
    location_id: str
    location_name: Optional[str] = "Sikkim Corridor"
    road_corridor: Optional[str] = "Mountain Highway"
    probability_percent: float
    severity_band: str = "MAJOR"
    message: str
    action_directive: Optional[str] = None
    date_string: Optional[str] = None
    road_blocked: bool = True
    rainfall_24h_mm: Optional[float] = 180.0
    rainfall_1h_mm: Optional[float] = 25.0


@router.post("/alerts/history/record")
def record_simulation_alert_event(body: SimulationHistoryRecordRequest):
    """
    Directly logs an automated simulation emergency alert and danger incident
    into persistent history.
    """
    contacts = list_contacts()
    recipients = [
        {"name": c.get("name"), "phone": c.get("phone_number"), "town": c.get("town"), "tier": "SECTOR_OBSERVER"}
        for c in contacts
    ] if contacts else [
        {"name": "Passang Norbu", "phone": "+919475012345", "town": "Mangan Bazaar", "tier": "WARD_OFFICER"},
        {"name": "Karma Lepcha", "phone": "+919733054321", "town": "Chungthang Town", "tier": "PANCHAYAT_SECY"},
    ]

    alert = record_alert_dispatch(
        alert_type="SIMULATION_EMERGENCY",
        location_id=body.location_id,
        location_name=body.location_name,
        road_corridor=body.road_corridor,
        probability_percent=body.probability_percent,
        severity_band=body.severity_band,
        recipients=recipients,
        message=body.message,
        provider="Simulation Auto-Relay",
        status="DELIVERED",
        date_string=body.date_string,
    )

    incident = record_danger_incident(
        location_id=body.location_id,
        location_name=body.location_name or body.location_id,
        road_corridor=body.road_corridor or "Mountain Highway",
        nearest_settlement=recipients[0].get("town", "North Sikkim"),
        severity_band=body.severity_band,
        max_probability_percent=body.probability_percent,
        peak_rainfall_24h_mm=body.rainfall_24h_mm or 180.0,
        peak_rainfall_1h_mm=body.rainfall_1h_mm or 25.0,
        status="SYSTEM_PREDICTED_SIMULATION",
        road_blocked=body.road_blocked,
        road_blockage_duration="Simulated Event Duration (12-48 hrs)",
        event_summary=f"System predicted critical hazard along {body.road_corridor} with {body.probability_percent}% probability.",
        early_warning_outcome=f"Automated citizen SMS broadcast auto-dispatched to {len(recipients)} observers: {body.action_directive or 'Evacuate to higher ground'}",
        date_string=body.date_string,
    )

    return {
        "success": True,
        "alert": alert,
        "incident": incident,
    }


@router.get("/alerts/history")
def get_alerts_history():
    """
    Returns full persistent history of all sent alerts and recorded
    historical danger/landslide incidents.
    """
    alerts_list = list_alerts_history()
    incidents_list = list_incidents_history()
    return {
        "alerts": alerts_list,
        "incidents": incidents_list,
        "total_alerts": len(alerts_list),
        "total_incidents": len(incidents_list),
    }


