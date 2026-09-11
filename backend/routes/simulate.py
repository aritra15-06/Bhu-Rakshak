from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime

from backend.models.location_state import (
    set_overrides,
    reset_overrides,
    reset_all_overrides,
    get_current_params,
    _BASELINE,
)
from backend.prediction_bridge import predict_from_params

router = APIRouter()


class SimulateRequest(BaseModel):
    location_id: str
    overrides: dict = {}
    reset: Optional[bool] = False


class BatchSimulateRequest(BaseModel):
    overrides_by_location: Dict[str, Dict[str, Any]] = {}
    reset_all: Optional[bool] = False


class ScenarioRequest(BaseModel):
    scenario_id: str


SCENARIO_DEFINITIONS = {
    "cloudburst_crisis": {
        "title": "⚡ North Sikkim Cloudburst Crisis",
        "description": "Severe localized cloudburst event centered over Chungthang-Lachen and Mangan highway corridors.",
        "overrides": {
            "LOC04": {"rainfall_1h_mm": 38.0, "rainfall_24h_mm": 250.0, "initial_saturation_0_1": 0.88, "slope_deg": 48.0, "cohesion_kpa": 3.0},
            "LOC02": {"rainfall_1h_mm": 24.0, "rainfall_24h_mm": 170.0, "initial_saturation_0_1": 0.82, "slope_deg": 43.0, "cohesion_kpa": 3.5},
            "LOC01": {"rainfall_1h_mm": 7.0, "rainfall_24h_mm": 70.0, "initial_saturation_0_1": 0.50, "slope_deg": 34.0, "cohesion_kpa": 6.0},
            "LOC06": {"rainfall_1h_mm": 5.5, "rainfall_24h_mm": 50.0, "initial_saturation_0_1": 0.45, "slope_deg": 38.0, "cohesion_kpa": 5.0},
            "LOC03": {"rainfall_1h_mm": 1.0, "rainfall_24h_mm": 12.0, "initial_saturation_0_1": 0.22, "slope_deg": 27.0, "cohesion_kpa": 9.0},
            "LOC05": {"rainfall_1h_mm": 0.2, "rainfall_24h_mm": 4.0, "initial_saturation_0_1": 0.18, "slope_deg": 22.0, "cohesion_kpa": 11.0},
        },
        "blocked_roads": ["Chungthang-Lachen Highway Cut", "Mangan-Dikchu Road"],
        "evac_towns": ["Lachen Road Camp", "Mangan Bazaar", "Dikchu Settlement"],
        "detour_towns": ["Gangtok Capital", "Rangpo Township", "Chungthang Town"],
    },
    "monsoon_surge": {
        "title": "🌧️ Widespread Regional Monsoon Surge",
        "description": "Continuous 48-hour monsoon rain bands elevating saturation across the entire North Sikkim transit belt.",
        "overrides": {
            "LOC01": {"rainfall_1h_mm": 9.0, "rainfall_24h_mm": 85.0, "initial_saturation_0_1": 0.58, "slope_deg": 34.0},
            "LOC02": {"rainfall_1h_mm": 12.0, "rainfall_24h_mm": 110.0, "initial_saturation_0_1": 0.65, "slope_deg": 41.0},
            "LOC03": {"rainfall_1h_mm": 6.0, "rainfall_24h_mm": 55.0, "initial_saturation_0_1": 0.45, "slope_deg": 27.0},
            "LOC04": {"rainfall_1h_mm": 14.0, "rainfall_24h_mm": 125.0, "initial_saturation_0_1": 0.68, "slope_deg": 46.0},
            "LOC05": {"rainfall_1h_mm": 3.5, "rainfall_24h_mm": 35.0, "initial_saturation_0_1": 0.38, "slope_deg": 22.0},
            "LOC06": {"rainfall_1h_mm": 8.5, "rainfall_24h_mm": 75.0, "initial_saturation_0_1": 0.52, "slope_deg": 38.0},
        },
        "blocked_roads": ["Mangan-Dikchu Road", "Chungthang-Lachen Highway Cut"],
        "evac_towns": ["Mangan Bazaar", "Lachen Road Camp"],
        "detour_towns": ["Chungthang Town", "Lachung Village", "Gangtok Capital"],
    },
    "dry_baseline": {
        "title": "☀️ Post-Monsoon Dry Baseline",
        "description": "Nominal sunny weather; all six monitoring stations operating under safe limit-equilibrium conditions.",
        "overrides": {
            "LOC01": {"rainfall_1h_mm": 0.0, "rainfall_24h_mm": 1.0, "initial_saturation_0_1": 0.15, "cohesion_kpa": 10.0},
            "LOC02": {"rainfall_1h_mm": 0.0, "rainfall_24h_mm": 1.0, "initial_saturation_0_1": 0.18, "cohesion_kpa": 12.0},
            "LOC03": {"rainfall_1h_mm": 0.0, "rainfall_24h_mm": 0.5, "initial_saturation_0_1": 0.12},
            "LOC04": {"rainfall_1h_mm": 0.0, "rainfall_24h_mm": 1.0, "initial_saturation_0_1": 0.18, "cohesion_kpa": 14.0},
            "LOC05": {"rainfall_1h_mm": 0.0, "rainfall_24h_mm": 0.2, "initial_saturation_0_1": 0.15},
            "LOC06": {"rainfall_1h_mm": 0.0, "rainfall_24h_mm": 1.0, "initial_saturation_0_1": 0.16, "cohesion_kpa": 12.0},
        },
        "blocked_roads": [],
        "evac_towns": [],
        "detour_towns": [],
    },
}


@router.post("/simulate")
def simulate(body: SimulateRequest, request: Request):
    try:
        if body.reset:
            params = reset_overrides(body.location_id)
        else:
            params = set_overrides(body.location_id, body.overrides)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown location_id: {body.location_id}")

    service = request.app.state.prediction_service
    result = predict_from_params(service, body.location_id, params)
    return result


@router.post("/simulate/batch")
def batch_simulate(body: BatchSimulateRequest, request: Request):
    service = request.app.state.prediction_service
    if body.reset_all:
        reset_all_overrides()

    sites_results = {}
    unstable_count = 0
    marginal_count = 0
    stable_count = 0

    for loc_id in _BASELINE.keys():
        if loc_id in body.overrides_by_location:
            params = set_overrides(loc_id, body.overrides_by_location[loc_id])
        else:
            params = get_current_params(loc_id)

        pred_res = predict_from_params(service, loc_id, params)
        sites_results[loc_id] = pred_res

        stability = pred_res.get("prediction", {}).get("physics_output", {}).get("stability_state", "UNKNOWN")
        if stability == "UNSTABLE":
            unstable_count += 1
        elif stability == "MARGINAL":
            marginal_count += 1
        else:
            stable_count += 1

    return {
        "sites": sites_results,
        "summary": {
            "total": len(sites_results),
            "unstable": unstable_count,
            "marginal": marginal_count,
            "stable": stable_count,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        },
    }


@router.post("/simulate/scenario")
def simulate_scenario(body: ScenarioRequest, request: Request):
    scenario = SCENARIO_DEFINITIONS.get(body.scenario_id)
    if not scenario:
        raise HTTPException(
            status_code=400,
            detail=f"unknown scenario_id '{body.scenario_id}'. Available: {list(SCENARIO_DEFINITIONS.keys())}",
        )

    service = request.app.state.prediction_service
    reset_all_overrides()
    overrides_map = scenario["overrides"]

    sites_results = {}
    unstable_count = 0
    marginal_count = 0
    stable_count = 0

    for loc_id in _BASELINE.keys():
        if loc_id in overrides_map:
            params = set_overrides(loc_id, overrides_map[loc_id])
        else:
            if body.scenario_id == "dry_baseline":
                params = get_current_params(loc_id)
            else:
                params = reset_overrides(loc_id)

        pred_res = predict_from_params(service, loc_id, params)
        sites_results[loc_id] = pred_res

        stability = pred_res.get("prediction", {}).get("physics_output", {}).get("stability_state", "UNKNOWN")
        if stability == "UNSTABLE":
            unstable_count += 1
        elif stability == "MARGINAL":
            marginal_count += 1
        else:
            stable_count += 1

    toast_type = "danger" if unstable_count > 0 else ("warning" if marginal_count > 0 else "success")
    if body.scenario_id == "cloudburst_crisis":
        msg = (
            "🚨 CRITICAL ALERTS: Urgent evacuation dispatched to Mangan Bazaar, Dikchu & Lachen Camp! "
            "Chungthang-Lachen Highway & Mangan-Dikchu Road are BLOCKED. Transit detour advisories broadcasted to Gangtok & Rangpo."
        )
    elif body.scenario_id == "monsoon_surge":
        msg = (
            "⚠️ MONSOON ALERT: Elevated pore-pressure along Mangan & Lachen corridors. "
            "Road monitoring patrols dispatched; precautionary transit advisories issued."
        )
    else:
        msg = "✅ All 6 North Sikkim pilot stations restored to stable baseline (FoS > 1.4). Safe travel conditions."

    return {
        "scenario_id": body.scenario_id,
        "title": scenario["title"],
        "description": scenario["description"],
        "sites": sites_results,
        "summary": {
            "total": len(sites_results),
            "unstable": unstable_count,
            "marginal": marginal_count,
            "stable": stable_count,
            "blocked_roads": scenario["blocked_roads"],
            "evac_towns": scenario["evac_towns"],
            "detour_towns": scenario["detour_towns"],
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        },
        "toast": {
            "type": toast_type,
            "title": scenario["title"],
            "message": msg,
            "evac_towns": scenario["evac_towns"],
            "blocked_roads": scenario["blocked_roads"],
            "detour_towns": scenario["detour_towns"],
        },
    }


class EphemeralSimulateRequest(BaseModel):
    overrides_by_location: Dict[str, Dict[str, Any]] = {}
    scenario_id: Optional[str] = None


@router.post("/simulate/ephemeral")
def simulate_ephemeral(body: EphemeralSimulateRequest, request: Request):
    """
    Computes physics and ML predictions for simulated overrides without modifying
    or persisting any state in the main dashboard. Completely isolated.
    """
    service = request.app.state.prediction_service
    overrides_map: Dict[str, Dict[str, Any]] = {}

    if body.scenario_id:
        scenario = SCENARIO_DEFINITIONS.get(body.scenario_id)
        if scenario:
            overrides_map = dict(scenario["overrides"])

    # Merge any specific client overrides on top of scenario
    for loc_id, ov in body.overrides_by_location.items():
        if loc_id in overrides_map:
            overrides_map[loc_id] = {**overrides_map[loc_id], **ov}
        else:
            overrides_map[loc_id] = ov

    sites_results = {}
    unstable_count = 0
    marginal_count = 0
    stable_count = 0

    for loc_id in _BASELINE.keys():
        baseline_params = dict(_BASELINE[loc_id])
        loc_overrides = overrides_map.get(loc_id, {})
        merged_params = dict(baseline_params)
        merged_params.update(loc_overrides)

        pred_res = predict_from_params(service, loc_id, merged_params)
        sites_results[loc_id] = pred_res

        stability = pred_res.get("prediction", {}).get("physics_output", {}).get("stability_state", "UNKNOWN")
        if stability == "UNSTABLE":
            unstable_count += 1
        elif stability == "MARGINAL":
            marginal_count += 1
        else:
            stable_count += 1

    return {
        "sites": sites_results,
        "scenario_id": body.scenario_id,
        "summary": {
            "total": len(sites_results),
            "unstable": unstable_count,
            "marginal": marginal_count,
            "stable": stable_count,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        },
    }
