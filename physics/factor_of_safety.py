"""
Infinite-slope, effective-stress Factor of Safety mechanics.

Implements exactly the equation given in contract section 3.2:

    FoS = [ c' + (gamma*z*cos(beta)^2 - u) * tan(phi') ]
          / [ gamma*z*sin(beta)*cos(beta) ]

This is a shallow-failure-only, single-slip-plane, effective-stress
infinite-slope model. It is explicitly NOT a full 3-D stability analysis
(contract section 3.2). Units: gamma in kN/m^3, z in m, u (pore pressure)
in kPa, angles in degrees converted to radians internally, c' and
resulting stresses in kPa.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

EPS = 1e-6


@dataclass
class MechanicsResult:
    effective_normal_stress_kpa: float
    driving_shear_stress_kpa: float
    resisting_shear_strength_kpa: float
    factor_of_safety: float


def compute_mechanics(
    cohesion_kpa: float,
    unit_weight_kn_m3: float,
    slip_depth_m: float,
    slope_deg: float,
    friction_angle_deg: float,
    pore_pressure_kpa: float,
) -> MechanicsResult:
    beta = math.radians(slope_deg)
    phi = math.radians(friction_angle_deg)

    sigma_n = unit_weight_kn_m3 * slip_depth_m * (math.cos(beta) ** 2)
    tau_d = unit_weight_kn_m3 * slip_depth_m * math.sin(beta) * math.cos(beta)
    sigma_eff = sigma_n - pore_pressure_kpa
    tau_r = cohesion_kpa + max(0.0, sigma_eff) * math.tan(phi)

    fos = tau_r / max(tau_d, EPS)

    return MechanicsResult(
        effective_normal_stress_kpa=round(sigma_eff, 4),
        driving_shear_stress_kpa=round(tau_d, 4),
        resisting_shear_strength_kpa=round(tau_r, 4),
        factor_of_safety=round(fos, 4),
    )


def classify_stability(fos: float) -> str:
    """
    Documented FoS bands (contract section 3.3: "Derived from documented
    FoS bands; not an ML prediction"). These are standard engineering
    convention bands for an MVP, not a calibrated regional threshold —
    that calibration is future work (roadmap, not MVP).
    """
    if fos is None:
        return "UNKNOWN"
    if fos >= 1.5:
        return "STABLE"
    if fos >= 1.0:
        return "MARGINAL"
    return "UNSTABLE"
