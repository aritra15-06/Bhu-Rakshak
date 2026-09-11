"""
Physics engine tests.

Implements contract section 8 step 10 "Validate against synthetic cases":
  - dry stable slope
  - increased rainfall -> higher water state -> lower FoS
  - stronger soil -> higher FoS
  - steeper slope -> lower FoS
Plus determinism (section 25 checklist item 1) and validity-flag behavior.
"""

import math
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from physics.schemas import SlopeState
from physics.engine import run_physics


def base_state(**overrides) -> SlopeState:
    defaults = dict(
        location_id="TEST01",
        slope_deg=30.0,
        aspect_deg=180.0,
        elevation_m=1800.0,
        cohesion_kpa=8.0,
        friction_angle_deg=30.0,
        unit_weight_kn_m3=18.0,
        slip_depth_m=1.5,
        hydraulic_conductivity_mm_h=10.0,
        porosity_0_1=0.45,
        initial_saturation_0_1=0.3,
        groundwater_depth_m=None,
    )
    defaults.update(overrides)
    return SlopeState(**defaults)


def test_determinism():
    state = base_state()
    rain = [0.0] * 24
    out1 = run_physics(state, rain)
    out2 = run_physics(state, rain)
    assert out1.factor_of_safety == out2.factor_of_safety
    assert out1.pore_pressure_kpa == out2.pore_pressure_kpa
    print("PASS: determinism")


def test_dry_stable_slope():
    """No rainfall, moderate slope, decent soil -> should be STABLE or MARGINAL, not UNSTABLE."""
    state = base_state(slope_deg=20.0, initial_saturation_0_1=0.1)
    rain = [0.0] * 72
    out = run_physics(state, rain)
    assert out.factor_of_safety > 1.0, f"expected dry slope stable, got FoS={out.factor_of_safety}"
    assert out.stability_state in ("STABLE", "MARGINAL")
    print(f"PASS: dry stable slope, FoS={out.factor_of_safety}, state={out.stability_state}")


def test_rainfall_lowers_fos():
    """Heavier rainfall must not increase FoS relative to no rainfall, all else equal."""
    state = base_state()
    dry = run_physics(state, [0.0] * 48)
    wet = run_physics(state, [15.0] * 48)  # sustained heavy rain, mm/h
    assert wet.factor_of_safety <= dry.factor_of_safety, (
        f"expected rainfall to reduce or maintain FoS: dry={dry.factor_of_safety} wet={wet.factor_of_safety}"
    )
    assert wet.pore_pressure_kpa >= dry.pore_pressure_kpa
    print(f"PASS: rainfall lowers FoS, dry={dry.factor_of_safety} wet={wet.factor_of_safety}")


def test_stronger_soil_raises_fos():
    """Higher cohesion and friction angle must not lower FoS."""
    rain = [5.0] * 24
    weak = base_state(cohesion_kpa=2.0, friction_angle_deg=20.0)
    strong = base_state(cohesion_kpa=20.0, friction_angle_deg=38.0)
    out_weak = run_physics(weak, rain)
    out_strong = run_physics(strong, rain)
    assert out_strong.factor_of_safety > out_weak.factor_of_safety, (
        f"expected stronger soil -> higher FoS: weak={out_weak.factor_of_safety} strong={out_strong.factor_of_safety}"
    )
    print(f"PASS: stronger soil raises FoS, weak={out_weak.factor_of_safety} strong={out_strong.factor_of_safety}")


def test_steeper_slope_lowers_fos():
    """Steeper slope, all else equal, must not raise FoS."""
    rain = [2.0] * 24
    gentle = base_state(slope_deg=15.0)
    steep = base_state(slope_deg=45.0)
    out_gentle = run_physics(gentle, rain)
    out_steep = run_physics(steep, rain)
    assert out_steep.factor_of_safety < out_gentle.factor_of_safety, (
        f"expected steeper slope -> lower FoS: gentle={out_gentle.factor_of_safety} steep={out_steep.factor_of_safety}"
    )
    print(f"PASS: steeper slope lowers FoS, gentle={out_gentle.factor_of_safety} steep={out_steep.factor_of_safety}")


def test_invalid_inputs_flagged_not_substituted():
    """Missing/invalid slip depth must yield UNAVAILABLE with flags, never a fabricated FoS."""
    state = base_state(slip_depth_m=0.0)
    out = run_physics(state, [0.0] * 10)
    assert out.physics_status == "UNAVAILABLE"
    assert out.factor_of_safety is None
    assert len(out.physics_validity_flags) > 0
    print("PASS: invalid inputs produce UNAVAILABLE + flags, no fabricated FoS")


def test_extreme_slope_flagged():
    state = base_state(slope_deg=85.0)
    out = run_physics(state, [0.0] * 10)
    assert any("slope_deg" in f for f in out.physics_validity_flags)
    print("PASS: out-of-range slope flagged")


def test_out_json_matches_contract_keys():
    state = base_state()
    out = run_physics(state, [3.0] * 24)
    d = out.to_json_dict()
    expected_keys = {
        "physics_status", "physics_model_version", "infiltration_rate_mm_h",
        "cumulative_infiltration_mm", "wetting_front_depth_m",
        "effective_saturation_0_1", "pore_pressure_kpa", "pore_pressure_status",
        "effective_normal_stress_kpa", "driving_shear_stress_kpa",
        "resisting_shear_strength_kpa", "factor_of_safety", "stability_state",
        "physics_validity_flags",
    }
    assert set(d.keys()) == expected_keys, f"key mismatch: {set(d.keys()) ^ expected_keys}"
    print("PASS: physics_output keys exactly match contract section 3.3/16")


if __name__ == "__main__":
    test_determinism()
    test_dry_stable_slope()
    test_rainfall_lowers_fos()
    test_stronger_soil_raises_fos()
    test_steeper_slope_lowers_fos()
    test_invalid_inputs_flagged_not_substituted()
    test_extreme_slope_flagged()
    test_out_json_matches_contract_keys()
    print("\nALL PHYSICS ENGINE TESTS PASSED")
