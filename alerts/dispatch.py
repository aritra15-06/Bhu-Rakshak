"""
Alert dispatch orchestrator.

Ties together: Action Engine decision -> distance-tiered contact
classification -> per-contact language selection -> SMS send (dry-run or
live). This is the module implementation_plan.md Section 5.3 specified;
this file is the actual working code behind that spec.
"""

from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from action.action_engine import decide_action
from backend.severity import compute_severity
from backend.confidence import assemble_confidence
from alerts.distance_tiers import classify_contacts
from alerts.language_templates import get_message
from alerts.sms_sender import send_sms


from gis.impact_engine import get_impact

def run_alert_cycle(
    prediction_json: dict,
    environmental_features: dict,
    contacts: list,
    dry_run: bool = True,
) -> dict:
    confidence = assemble_confidence(prediction_json)
    severity = compute_severity(
        factor_of_safety=prediction_json["physics_output"]["factor_of_safety"],
        slip_depth_m=environmental_features.get("slip_depth_m", 1.5),
        slope_deg=environmental_features.get("slope_deg", 30.0),
        rainfall_1h_mm=environmental_features.get("rainfall_1h_mm", 0.0),
        rainfall_24h_mm=environmental_features.get("rainfall_24h_mm", 0.0),
    )

    calibrated_p = prediction_json["ml_output"].get("calibrated_probability")
    if calibrated_p is None:
        return {
            "sent": False, "reason": "no ML output available (physics prerequisite missing)",
            "confidence": confidence.__dict__, "severity": severity.__dict__,
        }

    action = decide_action(
        calibrated_probability=calibrated_p,
        severity_band=severity.severity_band,
        confidence_band=confidence.confidence_band,
    )

    result = {
        "action": action.action,
        "action_reason": action.reason,
        "confidence": {"confidence_0_1": confidence.confidence_0_1, "confidence_band": confidence.confidence_band,
                       "reasons": confidence.reasons},
        "severity": {"severity_score_0_100": severity.severity_score_0_100, "severity_band": severity.severity_band,
                     "components": severity.components, "caveat": severity.caveat},
        "sent": False,
        "recipients": [],
    }

    if action.action not in ("RESTRICT", "EVACUATE"):
        result["reason"] = f"action={action.action}, below alert-dispatch threshold (RESTRICT/EVACUATE only)"
        return result

    hazard_lat = prediction_json["location"]["latitude"]
    hazard_lon = prediction_json["location"]["longitude"]
    site_name = prediction_json["location"]["location_id"]

    # Dynamic GIS map query for road corridor, landmark, and affected settlements
    impact_data = get_impact(location_id=site_name, latitude=hazard_lat, longitude=hazard_lon, buffer_m=2000.0)
    road_corridor = impact_data.get("primary_road_corridor", "Local Slope Access Route")
    landmark = impact_data.get("nearest_landmark", "Mountain slope corridor")
    danger_map = {
        "MINOR": "Light / Minor Landslide",
        "MODERATE": "Moderate Danger Level Landslide",
        "MAJOR": "Major Danger Level Landslide",
        "CATASTROPHIC_POTENTIAL": "Catastrophic / Severe Danger Level Landslide",
    }
    danger_level = danger_map.get(severity.severity_band, "Moderate Danger Level Landslide")

    affected_town_names = [v["name"] for v in impact_data.get("affected_villages", [])]
    if impact_data.get("nearest_town"):
        affected_town_names.append(impact_data["nearest_town"]["name"])

    classified = classify_contacts(
        hazard_lat,
        hazard_lon,
        contacts,
        hazard_location_id=site_name,
        affected_towns=affected_town_names,
    )

    recipients = []
    for entry in classified:
        contact = entry["contact"]
        language = contact.get("preferred_language", "en")
        message = get_message(
            entry["tier"],
            site_name,
            language=language,
            danger_level=danger_level,
            road_corridor=road_corridor,
            landmark=landmark,
        )
        send_result = send_sms(contact["phone_number"], message, dry_run=dry_run)
        recipients.append({
            "contact_id": contact.get("contact_id"),
            "name": contact.get("name"),
            "town": contact.get("town", "Unknown Settlement"),
            "tier": entry["tier"],
            "distance_m": entry["distance_m"],
            "language": language,
            "message": message,
            **send_result,
        })

    result["sent"] = True
    result["recipients"] = recipients
    return result
