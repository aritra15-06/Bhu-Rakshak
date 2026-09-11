"""
Application profile and configuration router.

Bhu-Rakshak Unified Architecture:
Unified Early-Warning, Geotechnical Intelligence & Alert History Console.
"""

from __future__ import annotations

import os
import json
from fastapi import APIRouter
from pydantic import BaseModel

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROFILE_FILE = os.path.join(REPO_ROOT, "data", "app_profile.json")

DEFAULT_PROFILE = "history"

router = APIRouter()


class ProfileUpdateRequest(BaseModel):
    profile: str = "history"


def get_active_profile() -> str:
    if os.path.exists(PROFILE_FILE):
        try:
            with open(PROFILE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("active_profile", DEFAULT_PROFILE)
        except Exception:
            pass
    return DEFAULT_PROFILE


def set_active_profile(profile_name: str = "history") -> str:
    valid = "history"
    try:
        os.makedirs(os.path.dirname(PROFILE_FILE), exist_ok=True)
        with open(PROFILE_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "active_profile": "history",
                "version_number": 2,
                "description": "Unified Early-Warning, Geotechnical Intelligence & Alert History Console",
                "default_on_boot": "history"
            }, f, indent=2)
    except Exception as e:
        print(f"[profile] Warning: failed to save profile: {e}")
    return valid


@router.get("/app-profile")
def read_profile():
    return {
        "active_profile": "history",
        "version_number": 2,
        "version_name": "Bhu-Rakshak Unified Early-Warning & Geotechnical Intelligence Console",
        "features": {
            "has_alerts_tab": False,
            "has_settings_modal": False,
            "has_alert_history_tab": True,
            "has_citizen_reports": False,
        }
    }


@router.post("/app-profile")
def update_profile(body: ProfileUpdateRequest):
    updated = set_active_profile(body.profile)
    return {
        "success": True,
        "active_profile": updated,
        "version_number": 2,
    }

