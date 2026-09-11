"""
Pore-water pressure estimation at the representative slip plane.

Per contract section 3.1 step 5 and section 8 step 7: the result must be
tagged ESTIMATED unless a real piezometer observation is used, and if the
model cannot justify an estimate it must return UNAVAILABLE rather than
inventing a value.

Method: a two-regime estimate.
  - If wetting front has NOT reached the slip plane (wetting_front_depth_m
    < slip_depth_m): pore pressure at the slip plane is estimated from a
    perched/transient wetting-front pressure-head approximation, scaled by
    how close the front is to the slip plane. This is a simplification,
    not a Richards-equation solve — flagged accordingly.
  - If the wetting front has reached or passed the slip plane: pore
    pressure is estimated hydrostatically from the excess saturation above
    the slip plane (u = gamma_w * h_w), a standard infinite-slope
    assumption when a perched water table forms above a lower-permeability
    boundary at the slip surface [R1, R2 conceptual basis].

If groundwater_depth_m is supplied and shallower than slip_depth_m, that
observation dominates (closer to a MEASURED-adjacent estimate, though still
tagged ESTIMATED for MVP since it is not a live piezometer reading).
"""

from __future__ import annotations

from typing import Optional

from .schemas import HydrologicState, PorePressureResult

GAMMA_WATER_KN_M3 = 9.81


def pore_pressure_model(
    hydro_state: HydrologicState,
    slip_depth_m: float,
    groundwater_depth_m: Optional[float] = None,
) -> PorePressureResult:
    if slip_depth_m is None or slip_depth_m <= 0:
        return PorePressureResult(u_kpa=0.0, status="UNAVAILABLE")

    # Case 1: an (assumed) known groundwater depth shallower than the slip plane.
    if groundwater_depth_m is not None and groundwater_depth_m <= slip_depth_m:
        head_m = slip_depth_m - groundwater_depth_m
        u_kpa = GAMMA_WATER_KN_M3 * head_m
        return PorePressureResult(u_kpa=round(u_kpa, 4), status="ESTIMATED")

    wf_depth = hydro_state.wetting_front_depth_m or 0.0

    # Case 2: wetting front has reached/passed the slip plane -> perched
    # water assumption, hydrostatic head from excess infiltration.
    if wf_depth >= slip_depth_m:
        excess_saturation = max(0.0, hydro_state.effective_saturation_0_1 - 0.5)
        head_m = excess_saturation * slip_depth_m  # bounded, monotonic proxy
        u_kpa = GAMMA_WATER_KN_M3 * head_m
        return PorePressureResult(u_kpa=round(u_kpa, 4), status="ESTIMATED")

    # Case 3: wetting front has not yet reached slip plane -> partial,
    # scaled transient pressure proportional to how far infiltration has
    # progressed toward the slip plane.
    progress = max(0.0, min(1.0, wf_depth / slip_depth_m))
    partial_head_m = progress * hydro_state.effective_saturation_0_1 * 0.5 * slip_depth_m
    u_kpa = GAMMA_WATER_KN_M3 * partial_head_m
    return PorePressureResult(u_kpa=round(u_kpa, 4), status="ESTIMATED")
