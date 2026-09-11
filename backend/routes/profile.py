"""
Application profile and version management router.

Manages the dual-version modes of Bhu-Rakshak:
- version1 ("operations"): Full operator console with Alerts section & Settings modal, Citizen Reports removed. (DEFAULT ON SERVER BOOT)
- version2 ("history"): Public/monitoring console with Alert History & Landslide Tracking, Alerts section & Settings removed, Citizen Reports removed.
"""

from __future__ import annotations

import os
import json
from fastapi import APIRouter
from pydantic import BaseModel

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROFILE_FILE = os.path.join(REPO_ROOT, "data", "app_profile.json")

# Default profile on fresh server boot is always "operations" (Version 1)
DEFAULT_PROFILE = "operations"

router = APIRouter()


class ProfileUpdateRequest(BaseModel):
    profile: str  # "operations" or "history"


def get_active_profile() -> str:
    if os.path.exists(PROFILE_FILE):
        try:
            with open(PROFILE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("active_profile", DEFAULT_PROFILE)
        except Exception:
            pass
    return DEFAULT_PROFILE


def set_active_profile(profile_name: str) -> str:
    valid = "history" if profile_name in ("history", "version2", "viewer") else "operations"
    try:
        os.makedirs(os.path.dirname(PROFILE_FILE), exist_ok=True)
        with open(PROFILE_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "active_profile": valid,
                "version_number": 1 if valid == "operations" else 2,
                "description": "Operations Mode (Alerts & Settings)" if valid == "operations" else "Public Monitoring Mode (Alert & Landslide History)",
                "default_on_boot": "operations"
            }, f, indent=2)
    except Exception as e:
        print(f"[profile] Warning: failed to save profile: {e}")
    return valid


@router.get("/app-profile")
def read_profile():
    active = get_active_profile()
    return {
        "active_profile": active,
        "version_number": 1 if active == "operations" else 2,
        "version_name": "Operations Console (Alerts + Settings)" if active == "operations" else "Public Monitoring Console (Alert & Landslide History)",
        "features": {
            "has_alerts_tab": active == "operations",
            "has_settings_modal": active == "operations",
            "has_alert_history_tab": active == "history",
            "has_citizen_reports": False,  # Removed in both versions as instructed
        }
    }


@router.post("/app-profile")
def update_profile(body: ProfileUpdateRequest):
    updated = set_active_profile(body.profile)
    return {
        "success": True,
        "active_profile": updated,
        "version_number": 1 if updated == "operations" else 2,
    }
