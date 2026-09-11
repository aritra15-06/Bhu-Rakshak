"""
Per-location parameter override store.

This is what makes the Simulation Console's "tweak LOC04's rainfall
without touching LOC01" behavior real on the server side, not just a
frontend illusion: each location_id has its own current override dict,
merged onto the location's baseline static parameters from
pilot_locations.json at prediction time.
"""

from __future__ import annotations

import json
import os

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OVERRIDES_FILE = os.path.join(REPO_ROOT, "data", "site_overrides.json")

def _load_persisted_overrides() -> dict:
    if os.path.exists(OVERRIDES_FILE):
        try:
            with open(OVERRIDES_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def _save_persisted_overrides():
    try:
        os.makedirs(os.path.dirname(OVERRIDES_FILE), exist_ok=True)
        with open(OVERRIDES_FILE, "w", encoding="utf-8") as f:
            json.dump(_overrides, f, indent=2)
    except Exception as e:
        print(f"[location_state] Warning: failed to persist overrides: {e}")

_overrides: dict = _load_persisted_overrides()  # location_id -> override dict


def _load_baseline_locations() -> dict:
    with open(os.path.join(REPO_ROOT, "demo", "pilot_locations.json")) as f:
        locs = json.load(f)["locations"]
    return {loc["location_id"]: loc for loc in locs}


_BASELINE = _load_baseline_locations()


def get_baseline(location_id: str) -> dict:
    if location_id not in _BASELINE:
        raise KeyError(f"unknown location_id: {location_id}")
    return dict(_BASELINE[location_id])


def get_current_params(location_id: str) -> dict:
    baseline = get_baseline(location_id)
    overrides = _overrides.get(location_id, {})
    merged = dict(baseline)
    merged.update(overrides)
    return merged


def set_overrides(location_id: str, overrides: dict) -> dict:
    if location_id not in _BASELINE:
        raise KeyError(f"unknown location_id: {location_id}")
    _overrides.setdefault(location_id, {}).update(overrides)
    _save_persisted_overrides()
    return get_current_params(location_id)


def reset_overrides(location_id: str) -> dict:
    _overrides.pop(location_id, None)
    _save_persisted_overrides()
    return get_current_params(location_id)


def reset_all_overrides() -> list:
    _overrides.clear()
    _save_persisted_overrides()
    return list_all_locations()


def list_all_locations() -> list:
    return [get_current_params(loc_id) for loc_id in _BASELINE]
