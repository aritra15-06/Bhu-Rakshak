"""
Integration tests for the prediction service: contract-shape compliance,
determinism where expected, and correct handling of UNAVAILABLE physics.

Requires artifacts/models/xgb_landslide_v1.0.joblib etc to already exist
(run `python3 -m ml.train` first).
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from physics.schemas import SlopeState
from service.prediction_service import PredictionService
from service.schemas import validate_raw_prediction_json, REQUIRED_TOP_LEVEL_KEYS


def _sample_env_features():
    return {
        "elevation_m": 1800.0, "slope_deg": 34.0, "aspect_sin": 0.5, "aspect_cos": 0.86,
        "plan_curvature": 0.001, "profile_curvature": -0.002, "flow_accumulation_m2": 500.0,
        "distance_to_stream_m": 120.0, "clay_percent": 22.0, "sand_percent": 35.0,
        "silt_percent": 43.0, "bulk_density_kg_m3": 1350.0, "ndvi_summary": 0.55,
        "nearest_historical_landslide_distance_m": 800.0,
        "historical_landslide_count_1km_5y": 1, "historical_landslide_count_5km_5y": 3,
        "rainfall_1h_mm": 4.0, "rainfall_3h_mm": 9.0, "rainfall_6h_mm": 15.0,
        "rainfall_12h_mm": 22.0, "rainfall_24h_mm": 40.0, "rainfall_72h_mm": 90.0,
        "rainfall_7d_mm": 180.0, "rainfall_30d_mm": 400.0,
    }


def test_valid_prediction_matches_contract():
    service = PredictionService.load_default()
    state = SlopeState(
        location_id="TESTLOC", slope_deg=34.0, aspect_deg=210.0, elevation_m=1780.0,
        cohesion_kpa=6.0, friction_angle_deg=28.0, unit_weight_kn_m3=18.5, slip_depth_m=1.6,
        hydraulic_conductivity_mm_h=12.0, porosity_0_1=0.44, initial_saturation_0_1=0.35,
        groundwater_depth_m=None,
    )
    rainfall = [3.0] * 48
    result = service.predict_location(
        location_id="TESTLOC", latitude=27.6, longitude=88.6, slope_state=state,
        hourly_rainfall_mm=rainfall, environmental_features=_sample_env_features(),
        soil_texture="silt_loam",
    )
    errors = validate_raw_prediction_json(result)
    assert errors == [], f"contract validation errors: {errors}"
    for k in REQUIRED_TOP_LEVEL_KEYS:
        assert k in result
    assert result["ml_output"]["predicted_class"] in (0, 1)
    assert 0.0 <= result["ml_output"]["positive_class_probability_raw"] <= 1.0
    assert result["physics_output"]["physics_status"] in ("AVAILABLE", "PARTIAL", "UNAVAILABLE")
    print("PASS: valid prediction matches contract, no forbidden keys present")


def test_unavailable_physics_does_not_fabricate_ml_output():
    service = PredictionService.load_default()
    bad_state = SlopeState(
        location_id="BADLOC", slope_deg=34.0, aspect_deg=210.0, elevation_m=1780.0,
        cohesion_kpa=6.0, friction_angle_deg=28.0, unit_weight_kn_m3=0.0,  # invalid -> hard fail
        slip_depth_m=1.6, hydraulic_conductivity_mm_h=12.0, porosity_0_1=0.44,
        initial_saturation_0_1=0.35, groundwater_depth_m=None,
    )
    result = service.predict_location(
        location_id="BADLOC", latitude=27.6, longitude=88.6, slope_state=bad_state,
        hourly_rainfall_mm=[3.0] * 24, environmental_features=_sample_env_features(),
    )
    assert result["physics_output"]["physics_status"] == "UNAVAILABLE"
    assert result["ml_output"]["predicted_class"] is None
    assert result["ml_output"]["positive_class_probability_raw"] is None
    print("PASS: UNAVAILABLE physics correctly suppresses fabricated ML output")


def test_multiple_locations_share_one_model_instance():
    service = PredictionService.load_default()
    id1 = id(service.base_model)
    state = SlopeState(
        location_id="A", slope_deg=25.0, aspect_deg=100.0, elevation_m=1200.0,
        cohesion_kpa=10.0, friction_angle_deg=30.0, unit_weight_kn_m3=18.0, slip_depth_m=1.2,
        hydraulic_conductivity_mm_h=10.0, porosity_0_1=0.4, initial_saturation_0_1=0.3,
        groundwater_depth_m=None,
    )
    service.predict_location(
        location_id="A", latitude=27.0, longitude=88.0, slope_state=state,
        hourly_rainfall_mm=[1.0] * 24, environmental_features=_sample_env_features(),
    )
    id2 = id(service.base_model)
    assert id1 == id2, "base model object must not be reloaded per location"
    print("PASS: repeated predictions reuse the same in-memory model object")


if __name__ == "__main__":
    test_valid_prediction_matches_contract()
    test_unavailable_physics_does_not_fabricate_ml_output()
    test_multiple_locations_share_one_model_instance()
    print("\nALL PREDICTION SERVICE TESTS PASSED")
