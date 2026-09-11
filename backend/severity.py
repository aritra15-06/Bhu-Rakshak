"""
Hazard magnitude proxy score.

WHAT THIS IS: a documented, deterministic function that turns physics
engine + ML outputs into a 0-100 "how big/dangerous could this be if it
happens" score, separate from "how likely is it to happen"
(ml_output.calibrated_probability already answers likelihood).

WHAT THIS IS NOT: a landslide volume or runout-distance prediction. Real
magnitude estimation for a specific slope needs failure-volume models
(e.g. slope geometry x estimated failure depth x width) and runout
modeling (e.g. energy-line / angle-of-reach methods), calibrated against
observed events. This prototype's physics engine models ONE representative
slip plane per analysis cell and does not model failure width, volume, or
runout at all. Building a real magnitude model is a legitimate next phase,
not a weekend addition.

WHY BUILD THIS ANYWAY: a smaller, shallower, gentler-sloped marginal
failure and a deep, steep, severely unstable one are genuinely different
hazards, and collapsing them into one probability number loses real
information a decision-maker would want. This proxy is a transparent,
inspectable combination of physically meaningful quantities already
computed by the physics engine (how far below the stability threshold,
how deep the slip surface, how steep the slope, how intense the
triggering rainfall) -- each with a documented, arguable-with weight, not
a black box. Treat it as "our engineered severity heuristic," and say so.

Per the user's explicit instruction, this does NOT touch the JSON
contract (physics_output / ml_output are untouched). It is computed as a
downstream backend calculation and returned as a SEPARATE field the
dashboard/alerts layer can read, alongside the raw prediction JSON --
never merged into it.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class SeverityResult:
    severity_score_0_100: float
    severity_band: str  # MINOR / MODERATE / MAJOR / CATASTROPHIC_POTENTIAL
    components: dict     # transparent breakdown for the evidence card
    caveat: str


def _fos_deficit_component(factor_of_safety: float) -> float:
    """
    Lower FoS -> larger component, saturating. FoS>=1.5 contributes ~0;
    FoS<=0.4 saturates near max. This is the single largest-weighted
    input because FoS is the physics engine's actual stability output.
    """
    if factor_of_safety is None:
        return 0.0
    deficit = max(0.0, 1.5 - factor_of_safety)
    return min(1.0, deficit / 1.1)  # normalizes 0 at FoS=1.5, ~1.0 at FoS=0.4


def _depth_component(slip_depth_m: float) -> float:
    """
    Deeper representative slip surface -> larger potential failure mass,
    all else equal. This is a standard qualitative relationship in slope
    stability (deeper failures mobilize more material) but the exact
    functional form here is a simple normalized ramp, not a calibrated
    volume model.
    """
    if slip_depth_m is None:
        return 0.0
    return min(1.0, max(0.0, (slip_depth_m - 0.3) / 2.7))  # 0 at 0.3m, 1.0 at 3.0m


def _slope_component(slope_deg: float) -> float:
    """Steeper slopes -> higher potential runout energy/speed. Simple
    normalized ramp across the physics engine's valid slope range."""
    if slope_deg is None:
        return 0.0
    return min(1.0, max(0.0, (slope_deg - 15.0) / 45.0))  # 0 at 15deg, 1.0 at 60deg


def _rainfall_intensity_component(rainfall_1h_mm: float, rainfall_24h_mm: float) -> float:
    """
    Sharper, more intense rainfall is associated with faster-triggering,
    often more energetic failures (debris flow literature broadly
    supports intensity, not just cumulative total, as a severity-relevant
    signal) -- again a normalized proxy, not a fitted threshold curve.
    """
    intensity_signal = (rainfall_1h_mm or 0.0) * 2.0 + (rainfall_24h_mm or 0.0) * 0.15
    return min(1.0, intensity_signal / 100.0)


# Documented, adjustable weights. Sum to 1.0. These are engineering
# judgment calls for a prototype, not fitted coefficients -- say so if asked.
WEIGHTS = {
    "fos_deficit": 0.45,
    "slip_depth": 0.20,
    "slope_angle": 0.20,
    "rainfall_intensity": 0.15,
}


def compute_severity(
    factor_of_safety: float,
    slip_depth_m: float,
    slope_deg: float,
    rainfall_1h_mm: float,
    rainfall_24h_mm: float,
) -> SeverityResult:
    components = {
        "fos_deficit": round(_fos_deficit_component(factor_of_safety), 4),
        "slip_depth": round(_depth_component(slip_depth_m), 4),
        "slope_angle": round(_slope_component(slope_deg), 4),
        "rainfall_intensity": round(_rainfall_intensity_component(rainfall_1h_mm, rainfall_24h_mm), 4),
    }
    score_0_1 = sum(WEIGHTS[k] * v for k, v in components.items())
    score_0_100 = round(score_0_1 * 100, 1)

    if score_0_100 < 25:
        band = "MINOR"
    elif score_0_100 < 50:
        band = "MODERATE"
    elif score_0_100 < 75:
        band = "MAJOR"
    else:
        band = "CATASTROPHIC_POTENTIAL"

    return SeverityResult(
        severity_score_0_100=score_0_100,
        severity_band=band,
        components=components,
        caveat=(
            "Engineered heuristic combining FoS deficit, slip depth, slope angle, and "
            "rainfall intensity. Not a validated failure-volume or runout prediction. "
            "Do not present as a measured magnitude estimate."
        ),
    )
