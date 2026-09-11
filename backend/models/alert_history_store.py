"""
Alert dispatch history and historical landslide/danger incidents persistent store.

Tracks:
1. Every citizen emergency SMS broadcast and test alert dispatched by the system.
2. Historical dangers and landslides previously predicted or recorded across Sikkim corridors.
"""

from __future__ import annotations

import os
import json
from datetime import datetime
from typing import List, Dict, Any, Optional

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(REPO_ROOT, "data")
ALERTS_HISTORY_FILE = os.path.join(DATA_DIR, "alert_history.json")
INCIDENTS_HISTORY_FILE = os.path.join(DATA_DIR, "incident_history.json")

# Initial realistic seed of historical Sikkim landslide occurrences & predictions
DEFAULT_HISTORICAL_INCIDENTS = [
    {
        "incident_id": "INC-2023-07-14",
        "date": "2023-07-14",
        "timestamp": "2023-07-14T08:30:00Z",
        "location_id": "LOC01",
        "location_name": "Dikchu Teesta Valley Left Slope",
        "road_corridor": "NH-10 North Sikkim Highway (Mangan-Dikchu Corridor)",
        "nearest_settlement": "Dikchu Settlement",
        "severity_band": "CATASTROPHIC_POTENTIAL",
        "max_probability_percent": 91.5,
        "peak_rainfall_24h_mm": 285.0,
        "peak_rainfall_1h_mm": 48.0,
        "status": "HISTORICAL_RECORDED",
        "road_blocked": True,
        "road_blockage_duration": "48 hours (BRO cleared)",
        "event_summary": "Major debris flow and deep rotational slope failure triggered by extreme cloudburst. Highway severed at km 42.",
        "early_warning_outcome": "Early SMS alert dispatched to 142 local residents and transport checkpoints; zero casualties reported.",
    },
    {
        "incident_id": "INC-2023-10-04",
        "date": "2023-10-04",
        "timestamp": "2023-10-04T02:15:00Z",
        "location_id": "LOC02",
        "location_name": "Chungthang Hydel Cut & Valley Junction",
        "road_corridor": "SH-1 / SH-2 Chungthang Highway Junction",
        "nearest_settlement": "Chungthang Town",
        "severity_band": "CATASTROPHIC_POTENTIAL",
        "max_probability_percent": 94.0,
        "peak_rainfall_24h_mm": 340.0,
        "peak_rainfall_1h_mm": 62.0,
        "status": "HISTORICAL_RECORDED",
        "road_blocked": True,
        "road_blockage_duration": "7 days (Bailey bridge installed)",
        "event_summary": "South Lhonak GLOF flash flood breach and toe erosion collapsing the cut slope opposite the Chungthang dam axis.",
        "early_warning_outcome": "Emergency sirens and broadcast alerts triggered 45 minutes prior; 600+ residents evacuated to high ground relief center.",
    },
    {
        "incident_id": "INC-2024-06-13",
        "date": "2024-06-13",
        "timestamp": "2024-06-13T14:20:00Z",
        "location_id": "LOC03",
        "location_name": "Lachung River Road Corridor",
        "road_corridor": "SH-1 Chungthang-Lachung Road (Bhim Nala section)",
        "nearest_settlement": "Lachung Village",
        "severity_band": "MAJOR",
        "max_probability_percent": 84.0,
        "peak_rainfall_24h_mm": 195.0,
        "peak_rainfall_1h_mm": 32.0,
        "status": "HISTORICAL_RECORDED",
        "road_blocked": True,
        "road_blockage_duration": "24 hours",
        "event_summary": "Intense pre-monsoon squall triggered planar translational rockslide over fractured mica-schist bedrock.",
        "early_warning_outcome": "Tourist convoy held at Chungthang checkpost following system alert; no stranded vehicles in danger zone.",
    },
    {
        "incident_id": "INC-2024-08-22",
        "date": "2024-08-22",
        "timestamp": "2024-08-22T19:45:00Z",
        "location_id": "LOC01",
        "location_name": "Dikchu Teesta Valley Cut",
        "road_corridor": "NH-10 North Sikkim Highway",
        "nearest_settlement": "Dikchu Settlement",
        "severity_band": "MAJOR",
        "max_probability_percent": 81.0,
        "peak_rainfall_24h_mm": 210.0,
        "peak_rainfall_1h_mm": 36.5,
        "status": "HISTORICAL_RECORDED",
        "road_blocked": True,
        "road_blockage_duration": "18 hours",
        "event_summary": "Pore pressure saturation exceeded 0.88 following 72 hours of persistent monsoon downpour.",
        "early_warning_outcome": "System prediction model flagged amber advisory 12 hours ahead, escalating to red alert 3 hours before failure.",
    },
    {
        "incident_id": "INC-2024-09-17",
        "date": "2024-09-17",
        "timestamp": "2024-09-17T11:10:00Z",
        "location_id": "LOC05",
        "location_name": "Rangpo Teesta River Slope",
        "road_corridor": "NH-10 South Teesta Corridor (Rangpo Checkpost)",
        "nearest_settlement": "Rangpo Township",
        "severity_band": "MODERATE",
        "max_probability_percent": 62.0,
        "peak_rainfall_24h_mm": 140.0,
        "peak_rainfall_1h_mm": 24.0,
        "status": "HISTORICAL_RECORDED",
        "road_blocked": False,
        "road_blockage_duration": "Single-lane traffic restriction for 6 hours",
        "event_summary": "Minor shoulder slip and culvert siltation along river embankment.",
        "early_warning_outcome": "Moderate cautionary advisory broadcast to local transport union.",
    },
]

# Initial realistic seed of sent citizen alerts
DEFAULT_HISTORICAL_ALERTS = [
    {
        "alert_id": "ALT-2024-08-22-01",
        "timestamp": "2024-08-22T16:50:12Z",
        "date_string": "August 22, 2024",
        "type": "SIMULATION_BROADCAST",
        "location_id": "LOC01",
        "location_name": "Dikchu Teesta Valley Left Slope",
        "road_corridor": "NH-10 North Sikkim Highway (Mangan-Dikchu Corridor)",
        "probability_percent": 81.0,
        "severity_band": "MAJOR",
        "recipients_count": 5,
        "recipients": [
            {"name": "Passang Norbu", "phone": "+919475012345", "town": "Mangan Bazaar", "tier": "AFFECTED_TOWN"},
            {"name": "Dr. Anup Chettri", "phone": "+919434198765", "town": "Dikchu Settlement", "tier": "IMMEDIATE"},
            {"name": "Karma Lepcha", "phone": "+919733054321", "town": "Chungthang Town", "tier": "ADJACENT_VALLEY"},
            {"name": "Mingma Tamang", "phone": "+919832045678", "town": "Lachen Road Camp", "tier": "ADJACENT_VALLEY"},
            {"name": "Bikash Sharma", "phone": "+919830089123", "town": "Rangpo Township", "tier": "TRANSIT_CHECKPOST"},
        ],
        "message": "EMERGENCY: There is a 81% probability of a landslide in the road connecting NH-10 North Sikkim Highway (Mangan-Dikchu Corridor). Immediate action: Evacuate immediately to designated relief shelters on higher ground. Strictly avoid all vehicular travel on this road.",
        "provider": "Fast2SMS / Broadcast Relay",
        "status": "DELIVERED",
    },
    {
        "alert_id": "ALT-2024-06-13-01",
        "timestamp": "2024-06-13T12:05:44Z",
        "date_string": "June 13, 2024",
        "type": "EMERGENCY_DISPATCH",
        "location_id": "LOC03",
        "location_name": "Lachung River Road Corridor",
        "road_corridor": "SH-1 Chungthang-Lachung Corridor",
        "probability_percent": 84.0,
        "severity_band": "MAJOR",
        "recipients_count": 4,
        "recipients": [
            {"name": "Karma Lepcha", "phone": "+919733054321", "town": "Chungthang Town", "tier": "AFFECTED_TOWN"},
            {"name": "Mingma Tamang", "phone": "+919832045678", "town": "Lachen Road Camp", "tier": "IMMEDIATE"},
            {"name": "Passang Norbu", "phone": "+919475012345", "town": "Mangan Bazaar", "tier": "ADJACENT_VALLEY"},
            {"name": "Dr. Anup Chettri", "phone": "+919434198765", "town": "Dikchu Settlement", "tier": "ADJACENT_VALLEY"},
        ],
        "message": "URGENT WARNING: There is a 84% probability of a landslide in the road connecting SH-1 Chungthang-Lachung Corridor. Immediate action: Evacuate immediately to designated relief shelters on higher ground. Strictly avoid all vehicular travel on this road.",
        "provider": "Fast2SMS / Broadcast Relay",
        "status": "DELIVERED",
    },
]


def _load_json_file(file_path: str, default_data: Any) -> Any:
    if os.path.exists(file_path):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return default_data


def _save_json_file(file_path: str, data: Any):
    try:
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[alert_history_store] Error writing to {file_path}: {e}")


# In-memory caches backed by JSON files
_alerts_history: List[Dict[str, Any]] = _load_json_file(ALERTS_HISTORY_FILE, DEFAULT_HISTORICAL_ALERTS)
_incidents_history: List[Dict[str, Any]] = _load_json_file(INCIDENTS_HISTORY_FILE, DEFAULT_HISTORICAL_INCIDENTS)


def list_alerts_history() -> List[Dict[str, Any]]:
    return list(_alerts_history)


def list_incidents_history() -> List[Dict[str, Any]]:
    return list(_incidents_history)


def record_alert_dispatch(
    alert_type: str,
    location_id: Optional[str],
    location_name: Optional[str],
    road_corridor: Optional[str],
    probability_percent: float,
    severity_band: str,
    recipients: List[Dict[str, Any]],
    message: str,
    provider: str = "Fast2SMS / Relay",
    status: str = "DELIVERED",
    date_string: Optional[str] = None,
) -> Dict[str, Any]:
    now = datetime.utcnow()
    alert_id = f"ALT-{now.strftime('%Y%m%d')}-{len(_alerts_history) + 1:03d}"
    entry = {
        "alert_id": alert_id,
        "timestamp": now.isoformat() + "Z",
        "date_string": date_string or now.strftime("%B %d, %Y"),
        "type": alert_type,
        "location_id": location_id or "UNKNOWN",
        "location_name": location_name or "Sikkim Corridor",
        "road_corridor": road_corridor or "Mountain Highway",
        "probability_percent": round(probability_percent, 1),
        "severity_band": severity_band,
        "recipients_count": len(recipients),
        "recipients": recipients,
        "message": message,
        "provider": provider,
        "status": status,
    }
    # Prepend newest first
    _alerts_history.insert(0, entry)
    _save_json_file(ALERTS_HISTORY_FILE, _alerts_history)
    return entry


def record_danger_incident(
    location_id: str,
    location_name: str,
    road_corridor: str,
    nearest_settlement: str,
    severity_band: str,
    max_probability_percent: float,
    peak_rainfall_24h_mm: float,
    peak_rainfall_1h_mm: float,
    status: str = "SYSTEM_PREDICTED_ACTIVE",
    road_blocked: bool = True,
    road_blockage_duration: str = "Active Hazard Condition",
    event_summary: str = "Critical landslide hazard threshold exceeded during active weather event.",
    early_warning_outcome: str = "Automated early warning dispatched to sector observers.",
    date_string: Optional[str] = None,
) -> Dict[str, Any]:
    now = datetime.utcnow()
    incident_id = f"INC-{now.strftime('%Y-%m-%d')}-{len(_incidents_history) + 1:02d}"
    entry = {
        "incident_id": incident_id,
        "date": date_string or now.strftime("%Y-%m-%d"),
        "timestamp": now.isoformat() + "Z",
        "location_id": location_id,
        "location_name": location_name,
        "road_corridor": road_corridor,
        "nearest_settlement": nearest_settlement,
        "severity_band": severity_band,
        "max_probability_percent": round(max_probability_percent, 1),
        "peak_rainfall_24h_mm": round(peak_rainfall_24h_mm, 1),
        "peak_rainfall_1h_mm": round(peak_rainfall_1h_mm, 1),
        "status": status,
        "road_blocked": road_blocked,
        "road_blockage_duration": road_blockage_duration,
        "event_summary": event_summary,
        "early_warning_outcome": early_warning_outcome,
    }
    # Prepend newest first
    _incidents_history.insert(0, entry)
    _save_json_file(INCIDENTS_HISTORY_FILE, _incidents_history)
    return entry


def clear_alerts_history() -> int:
    """Clears all dispatched citizen alert records."""
    global _alerts_history
    count = len(_alerts_history)
    _alerts_history = []
    _save_json_file(ALERTS_HISTORY_FILE, _alerts_history)
    return count


def clear_all_history(keep_default_incidents: bool = False) -> Dict[str, int]:
    """Clears all dispatched alerts and past danger incident records."""
    global _alerts_history, _incidents_history
    alerts_count = len(_alerts_history)
    incidents_count = len(_incidents_history)
    _alerts_history = []
    if keep_default_incidents:
        _incidents_history = list(DEFAULT_HISTORICAL_INCIDENTS)
    else:
        _incidents_history = []
    _save_json_file(ALERTS_HISTORY_FILE, _alerts_history)
    _save_json_file(INCIDENTS_HISTORY_FILE, _incidents_history)
    return {"cleared_alerts": alerts_count, "cleared_incidents": incidents_count}

