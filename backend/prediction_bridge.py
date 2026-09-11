"""
Prediction bridge: turns a location's current (baseline + override)
parameters into a full call to service/prediction_service.py, generating
the rainfall series and environmental feature dict the service needs.

This is the one place that decides "given these slider positions, what
rainfall history and environmental features do we feed the real model" —
kept separate from the route handlers so /api/predict and /api/simulate
share identical logic and can't drift apart.
"""

from __future__ import annotations

import math
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from physics.schemas import SlopeState
from backend.severity import compute_severity
from backend.confidence import assemble_confidence
from gis.impact_engine import get_impact


def _build_rainfall_series(params: dict, hours: int = 72) -> list:
    """
    Builds an hourly rainfall series ending "now" whose recent-window
    sums match the slider-controlled rainfall_1h_mm / rainfall_24h_mm
    values as closely as a simple constructed profile can. This keeps
    the Simulation Console's sliders semantically meaningful (the
    physics engine actually sees elevated rainfall when you raise the
    slider) without needing a full synthetic-storm generator at request time.
    """
    rain_1h = params.get("rainfall_1h_mm", 0.0)
    rain_24h = params.get("rainfall_24h_mm", rain_1h * 10)

    series = [0.0] * hours
    series[-1] = rain_1h  # most recent hour matches the 1h slider exactly

    # Distribute the remaining 24h total (minus the 1h already placed)
    # across the preceding 23 hours with a front-loaded taper, so rain
    # intensifies toward "now" -- a physically reasonable approaching-storm
    # shape rather than a flat block.
    remaining = max(0.0, rain_24h - rain_1h)
    if remaining > 0 and hours >= 24:
        weights = [math.exp(-((23 - i) / 8.0)) for i in range(23)]
        total_w = sum(weights)
        for i, w in enumerate(weights):
            series[hours - 24 + i] = remaining * w / total_w

    return series


def _build_environmental_features(params: dict, rainfall_series: list) -> dict:
    def window_sum(hrs):
        return float(sum(rainfall_series[-hrs:]))

    return {
        "elevation_m": params["elevation_m"],
        "slope_deg": params["slope_deg"],
        "aspect_sin": math.sin(math.radians(params["aspect_deg"])),
        "aspect_cos": math.cos(math.radians(params["aspect_deg"])),
        "plan_curvature": params.get("plan_curvature", 0.0),
        "profile_curvature": params.get("profile_curvature", 0.0),
        "flow_accumulation_m2": params.get("flow_accumulation_m2", 500.0),
        "distance_to_stream_m": params.get("distance_to_stream_m", 200.0),
        "clay_percent": params.get("clay_percent", 25.0),
        "sand_percent": params.get("sand_percent", 35.0),
        "silt_percent": params.get("silt_percent", 40.0),
        "bulk_density_kg_m3": params.get("bulk_density_kg_m3", 1350.0),
        "ndvi_summary": params.get("ndvi_summary", 0.5),
        "nearest_historical_landslide_distance_m": params.get("nearest_historical_landslide_distance_m", 1000.0),
        "historical_landslide_count_1km_5y": params.get("historical_landslide_count_1km_5y", 1),
        "historical_landslide_count_5km_5y": params.get("historical_landslide_count_5km_5y", 3),
        "rainfall_1h_mm": window_sum(1),
        "rainfall_3h_mm": window_sum(3),
        "rainfall_6h_mm": window_sum(6),
        "rainfall_12h_mm": window_sum(12),
        "rainfall_24h_mm": window_sum(24),
        "rainfall_72h_mm": window_sum(72),
        "rainfall_7d_mm": window_sum(24 * 7) if len(rainfall_series) >= 24 * 7 else window_sum(len(rainfall_series)),
        "rainfall_30d_mm": window_sum(24 * 30) if len(rainfall_series) >= 24 * 30 else window_sum(len(rainfall_series)),
    }


def predict_from_params(prediction_service, location_id: str, params: dict) -> dict:
    rainfall_series = _build_rainfall_series(params)
    env_features = _build_environmental_features(params, rainfall_series)

    state = SlopeState(
        location_id=location_id,
        slope_deg=params["slope_deg"], aspect_deg=params["aspect_deg"], elevation_m=params["elevation_m"],
        cohesion_kpa=params["cohesion_kpa"], friction_angle_deg=params["friction_angle_deg"],
        unit_weight_kn_m3=params["unit_weight_kn_m3"], slip_depth_m=params["slip_depth_m"],
        hydraulic_conductivity_mm_h=params["hydraulic_conductivity_mm_h"],
        porosity_0_1=params["porosity_0_1"], initial_saturation_0_1=params["initial_saturation_0_1"],
        groundwater_depth_m=params.get("groundwater_depth_m"),
    )

    raw_prediction = prediction_service.predict_location(
        location_id=location_id,
        latitude=params["latitude"], longitude=params["longitude"],
        slope_state=state, hourly_rainfall_mm=rainfall_series,
        environmental_features=env_features,
        analysis_time_utc=datetime.now(timezone.utc).isoformat(),
        soil_texture=params.get("soil_texture"),
    )

    confidence = assemble_confidence(raw_prediction)
    severity = compute_severity(
        factor_of_safety=raw_prediction["physics_output"]["factor_of_safety"],
        slip_depth_m=params["slip_depth_m"], slope_deg=params["slope_deg"],
        rainfall_1h_mm=env_features["rainfall_1h_mm"], rainfall_24h_mm=env_features["rainfall_24h_mm"],
    )

    # Dynamically compute spatial context (nearest road centerline & settlements)
    spatial_context = get_impact(
        location_id=location_id,
        latitude=params.get("latitude"),
        longitude=params.get("longitude"),
        buffer_m=1000.0,
    )

    return {
        "prediction": raw_prediction,
        "confidence": {"confidence_0_1": confidence.confidence_0_1, "confidence_band": confidence.confidence_band,
                       "reasons": confidence.reasons},
        "severity": {"severity_score_0_100": severity.severity_score_0_100, "severity_band": severity.severity_band,
                     "components": severity.components, "caveat": severity.caveat},
        "spatial_context": spatial_context,
        "environmental_features_used": env_features,
        "current_params": params,
        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
