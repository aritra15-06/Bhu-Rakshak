"""
Infiltration / wetting-state model.

Implementation choice: Green-Ampt cumulative-infiltration model, explicitly
flagged by the JSON contract (section 3.1 step 4, section 8 step 5) as an
acceptable MVP benchmark, PROVIDED the assumptions are documented. This is
a simplification of the TRIGRS transient rainfall-infiltration formulation
[R1, R2] and is not a substitute for it.

Documented assumptions (must be listed as physics_validity_flags when they
materially affect the result):

  A1. Ponded-infiltration Green-Ampt form is used; rainfall intensities
      below infiltration capacity infiltrate directly. This under-represents
      infiltration excess during very high-intensity bursts, which is a
      known Green-Ampt simplification, not a TRIGRS-fidelity result.
  A2. Effective porosity (theta_s - theta_i) is derived from porosity minus
      antecedent saturation * porosity, not a lab-measured drainable
      porosity.
  A3. Wetting-front suction head is derived from a fixed lookup, not a
      site-measured soil-water characteristic curve, unless the caller
      supplies one.
  A4. The model is 1-D and vertical; it ignores lateral subsurface flow
      and macropore/preferential flow paths, both material in real
      Himalayan colluvium.

Reference: Green, W.H. and Ampt, G.A. (1911); adapted here as an
explicitly-flagged benchmark per the contract's instruction to "never mix
formula fragments without documenting assumptions" (section 8 step 5).
"""

from __future__ import annotations

import math
from typing import List, Optional

from .schemas import HydrologicState

EPS = 1e-6

# Wetting-front suction head lookup by broad soil texture proxy (cm of water).
# Coarse defaults adapted from published Green-Ampt parameter tables
# (Rawls, Brakensiek & Miller-style soil class ranges). This is a lookup,
# not a site measurement — assumption A3 above.
SUCTION_HEAD_CM_BY_TEXTURE = {
    "sand": 4.95,
    "sandy_loam": 11.01,
    "loam": 8.89,
    "silt_loam": 16.68,
    "clay_loam": 20.88,
    "clay": 31.63,
}
DEFAULT_TEXTURE = "silt_loam"  # reasonable default for weathered Himalayan colluvium


def _suction_head_m(soil_texture: Optional[str]) -> float:
    key = (soil_texture or DEFAULT_TEXTURE).lower()
    cm = SUCTION_HEAD_CM_BY_TEXTURE.get(key, SUCTION_HEAD_CM_BY_TEXTURE[DEFAULT_TEXTURE])
    return cm / 100.0


def infiltration_model(
    hourly_rainfall_mm: List[float],
    initial_saturation_0_1: float,
    porosity_0_1: float,
    hydraulic_conductivity_mm_h: float,
    soil_texture: Optional[str] = None,
) -> HydrologicState:
    """
    Run a Green-Ampt-style cumulative infiltration model over an hourly
    rainfall series, returning the wetting state at the end of the series
    (i.e. at analysis_time_utc).

    hourly_rainfall_mm: rainfall history, oldest first, ending at
        analysis_time_utc. Only values at-or-before analysis_time_utc must
        be passed in by the caller (contract section 23: no future info).
    """
    if hydraulic_conductivity_mm_h <= 0 or porosity_0_1 <= 0:
        # Cannot run infiltration physically -> caller must mark UNAVAILABLE.
        return HydrologicState(
            infiltration_rate_mm_h=0.0,
            cumulative_infiltration_mm=0.0,
            wetting_front_depth_m=0.0,
            effective_saturation_0_1=max(0.0, min(1.0, initial_saturation_0_1)),
        )

    initial_saturation_0_1 = max(0.0, min(1.0, initial_saturation_0_1))
    delta_theta = max(porosity_0_1 * (1.0 - initial_saturation_0_1), 1e-4)  # A2
    psi_m = _suction_head_m(soil_texture)  # A3
    ks_m_h = hydraulic_conductivity_mm_h / 1000.0  # mm/h -> m/h

    cumulative_infiltration_m = 0.0
    current_rate_mm_h = 0.0

    for rain_mm in hourly_rainfall_mm:
        # Green-Ampt infiltration capacity (m/h) given current cumulative F (m):
        #   f_c = Ks * (1 + psi*delta_theta / F)      [ponded regime, A1]
        if cumulative_infiltration_m < 1e-6:
            f_c_m_h = ks_m_h * 5.0 if ks_m_h > 0 else 0.0  # high early-capacity bound
        else:
            f_c_m_h = ks_m_h * (1.0 + (psi_m * delta_theta) / cumulative_infiltration_m)

        rain_m_h = max(rain_mm, 0.0) / 1000.0  # mm/h -> m/h (hourly step so mm == mm/h numerically)
        actual_rate_m_h = min(rain_m_h, f_c_m_h)  # A1: rainfall-limited or capacity-limited

        cumulative_infiltration_m += actual_rate_m_h  # 1-hour step
        current_rate_mm_h = actual_rate_m_h * 1000.0

    wetting_front_depth_m = cumulative_infiltration_m / delta_theta if delta_theta > 0 else 0.0

    # Saturation proxy: blend initial state toward saturated as the wetting
    # front approaches a reference shallow-failure depth. This is a
    # simplification (assumption A2/A4) — it is not a full Richards-equation
    # saturation profile, just a monotonic, bounded, reproducible proxy.
    ref_depth_m = 2.0  # reference shallow-failure depth for saturation scaling
    progress = max(0.0, min(1.0, wetting_front_depth_m / ref_depth_m))
    effective_saturation = initial_saturation_0_1 + (1.0 - initial_saturation_0_1) * progress
    effective_saturation = max(0.0, min(1.0, effective_saturation))

    return HydrologicState(
        infiltration_rate_mm_h=round(current_rate_mm_h, 4),
        cumulative_infiltration_mm=round(cumulative_infiltration_m * 1000.0, 4),
        wetting_front_depth_m=round(wetting_front_depth_m, 4),
        effective_saturation_0_1=round(effective_saturation, 4),
    )


SLIP_DEPTH_REF = 2.0  # module-level reference used above; kept explicit for clarity
