"""
Physics Engine — top-level pure function.

physics_engine.run(state, rainfall, params) -> physics_output dict, exactly
as sketched in contract section 9 / section 12 "Package as a service/function".

Kept independent of FastAPI / the DB so it can be unit tested per the
contract (section 8 step 12) and reused identically at training time and
inference time (contract section 12 step 3: "using exactly the same
Physics Engine version used at inference time").
"""

from __future__ import annotations

from typing import List, Optional

from .schemas import (
    PHYSICS_MODEL_VERSION,
    PhysicsOutput,
    SlopeState,
    SLOPE_DEG_MIN, SLOPE_DEG_MAX,
    PHI_DEG_MIN, PHI_DEG_MAX,
    GAMMA_MIN, GAMMA_MAX,
    COHESION_MIN, COHESION_MAX,
    SLIP_DEPTH_MIN, SLIP_DEPTH_MAX,
    KS_MIN, KS_MAX,
)
from .infiltration import infiltration_model
from .pore_pressure import pore_pressure_model
from .factor_of_safety import compute_mechanics, classify_stability


def validate_inputs(state: SlopeState) -> List[str]:
    """Contract section 8 step 9 / section 9: flag impossible/suspicious values."""
    flags: List[str] = []

    if not (SLOPE_DEG_MIN <= state.slope_deg <= SLOPE_DEG_MAX):
        flags.append(f"slope_deg {state.slope_deg} outside expected range "
                      f"[{SLOPE_DEG_MIN},{SLOPE_DEG_MAX}]")
    if not (PHI_DEG_MIN <= state.friction_angle_deg <= PHI_DEG_MAX):
        flags.append(f"friction_angle_deg {state.friction_angle_deg} outside allowed range "
                      f"[{PHI_DEG_MIN},{PHI_DEG_MAX}]")
    if not (GAMMA_MIN <= state.unit_weight_kn_m3 <= GAMMA_MAX):
        flags.append(f"unit_weight_kn_m3 {state.unit_weight_kn_m3} outside typical range "
                      f"[{GAMMA_MIN},{GAMMA_MAX}]")
    if state.unit_weight_kn_m3 <= 0:
        flags.append("negative or zero unit weight")
    if not (COHESION_MIN <= state.cohesion_kpa <= COHESION_MAX):
        flags.append(f"cohesion_kpa {state.cohesion_kpa} outside expected range "
                      f"[{COHESION_MIN},{COHESION_MAX}]")
    if state.slip_depth_m is None or state.slip_depth_m <= 0:
        flags.append("missing or non-positive slip_depth_m")
    elif not (SLIP_DEPTH_MIN <= state.slip_depth_m <= SLIP_DEPTH_MAX):
        flags.append(f"slip_depth_m {state.slip_depth_m} outside shallow-failure MVP range "
                      f"[{SLIP_DEPTH_MIN},{SLIP_DEPTH_MAX}] — model not valid for deep-seated failures")
    if not (KS_MIN <= state.hydraulic_conductivity_mm_h <= KS_MAX):
        flags.append(f"hydraulic_conductivity_mm_h {state.hydraulic_conductivity_mm_h} "
                      f"outside expected range [{KS_MIN},{KS_MAX}]")
    if not (0.0 <= state.porosity_0_1 <= 0.75):
        flags.append(f"porosity_0_1 {state.porosity_0_1} outside physically plausible range [0,0.75]")
    if not (0.0 <= state.initial_saturation_0_1 <= 1.0):
        flags.append(f"initial_saturation_0_1 {state.initial_saturation_0_1} outside [0,1]")

    return flags


def run_physics(
    state: SlopeState,
    hourly_rainfall_mm: List[float],
    soil_texture: Optional[str] = None,
) -> PhysicsOutput:
    """
    Pure function: same inputs -> same outputs, always (contract section 8
    step 12, section 25 checklist item 1).
    """
    flags = validate_inputs(state)

    # Hard-fail conditions: cannot compute mechanics meaningfully at all.
    hard_fail = (
        state.slip_depth_m is None or state.slip_depth_m <= 0
        or state.unit_weight_kn_m3 <= 0
    )
    if hard_fail:
        return PhysicsOutput(
            physics_status="UNAVAILABLE",
            physics_model_version=PHYSICS_MODEL_VERSION,
            infiltration_rate_mm_h=None,
            cumulative_infiltration_mm=None,
            wetting_front_depth_m=None,
            effective_saturation_0_1=None,
            pore_pressure_kpa=None,
            pore_pressure_status="UNAVAILABLE",
            effective_normal_stress_kpa=None,
            driving_shear_stress_kpa=None,
            resisting_shear_strength_kpa=None,
            factor_of_safety=None,
            stability_state="UNKNOWN",
            physics_validity_flags=flags + ["hard_fail: missing/invalid geotechnical inputs, "
                                             "no arbitrary substitution performed"],
        )

    hydro = infiltration_model(
        hourly_rainfall_mm=hourly_rainfall_mm,
        initial_saturation_0_1=state.initial_saturation_0_1,
        porosity_0_1=state.porosity_0_1,
        hydraulic_conductivity_mm_h=state.hydraulic_conductivity_mm_h,
        soil_texture=soil_texture,
    )

    pore = pore_pressure_model(
        hydro_state=hydro,
        slip_depth_m=state.slip_depth_m,
        groundwater_depth_m=state.groundwater_depth_m,
    )

    mech = compute_mechanics(
        cohesion_kpa=state.cohesion_kpa,
        unit_weight_kn_m3=state.unit_weight_kn_m3,
        slip_depth_m=state.slip_depth_m,
        slope_deg=state.slope_deg,
        friction_angle_deg=state.friction_angle_deg,
        pore_pressure_kpa=pore.u_kpa,
    )

    stability = classify_stability(mech.factor_of_safety)

    # Numerical-instability check (section 8 step 9)
    if mech.factor_of_safety is not None and (mech.factor_of_safety != mech.factor_of_safety or mech.factor_of_safety > 100):
        flags.append("numerically unstable or implausible FoS (near-zero driving stress); "
                      "treat as low-confidence")

    status = "AVAILABLE" if not flags else "PARTIAL"

    return PhysicsOutput(
        physics_status=status,
        physics_model_version=PHYSICS_MODEL_VERSION,
        infiltration_rate_mm_h=hydro.infiltration_rate_mm_h,
        cumulative_infiltration_mm=hydro.cumulative_infiltration_mm,
        wetting_front_depth_m=hydro.wetting_front_depth_m,
        effective_saturation_0_1=hydro.effective_saturation_0_1,
        pore_pressure_kpa=pore.u_kpa,
        pore_pressure_status=pore.status,
        effective_normal_stress_kpa=mech.effective_normal_stress_kpa,
        driving_shear_stress_kpa=mech.driving_shear_stress_kpa,
        resisting_shear_strength_kpa=mech.resisting_shear_strength_kpa,
        factor_of_safety=mech.factor_of_safety,
        stability_state=stability,
        physics_validity_flags=flags,
    )
