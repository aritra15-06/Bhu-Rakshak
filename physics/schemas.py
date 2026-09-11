"""
Bhu-Rakshak Physics Engine — data schemas.

These dataclasses define the inputs and outputs of the physics engine.
They intentionally mirror the field names in
Bhu-Rakshak_ML_Data_Requirements_JSON_Contract_v4_FINAL.docx section 3.3
so that physics_output dict keys can be dropped directly into the raw
prediction JSON without renaming.

Do not add fields here that the contract does not define under
`physics_output`. If you need a new diagnostic, add it as an internal
field and only surface it in physics_validity_flags / evidence, not as
a new top-level physics_output key, unless the contract is updated.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


PHYSICS_MODEL_VERSION = "infinite_slope_effective_stress_v1.0"

# Physically plausible bounds used for validity checking (section 9, step 9).
# These are sanity bounds for an MVP shallow-failure infinite-slope model,
# not universal geotechnical limits.
SLOPE_DEG_MIN, SLOPE_DEG_MAX = 0.0, 70.0
PHI_DEG_MIN, PHI_DEG_MAX = 10.0, 45.0
GAMMA_MIN, GAMMA_MAX = 12.0, 24.0  # kN/m^3, typical soil unit weight range
COHESION_MIN, COHESION_MAX = 0.0, 60.0  # kPa
SLIP_DEPTH_MIN, SLIP_DEPTH_MAX = 0.3, 5.0  # m, shallow-failure regime only
KS_MIN, KS_MAX = 0.1, 500.0  # mm/h, saturated hydraulic conductivity


@dataclass
class SlopeState:
    """Static/slowly-varying geotechnical + terrain state for one analysis cell."""

    location_id: str
    slope_deg: float
    aspect_deg: float
    elevation_m: float

    # Soil / mechanical parameters (section 3.1 step 2)
    cohesion_kpa: float          # c'
    friction_angle_deg: float    # phi'
    unit_weight_kn_m3: float     # gamma
    slip_depth_m: float          # z, representative slip-plane depth
    hydraulic_conductivity_mm_h: float  # Ks, saturated
    porosity_0_1: float          # theta_s
    initial_saturation_0_1: float  # antecedent wetness, 0-1
    groundwater_depth_m: Optional[float] = None  # None if unknown -> estimate from state


@dataclass
class RainfallHistory:
    """Rainfall time series available at or before analysis_time_utc.

    Values are hourly mm, oldest first, ending at analysis_time_utc.
    Only rainfall known at-or-before analysis_time_utc may be included —
    this is enforced by the caller, not by this class, but the field name
    documents the rule from contract section 3.1 step 3 / section 23.
    """

    location_id: str
    analysis_time_utc: str
    hourly_mm: list  # list[float], most recent last


@dataclass
class HydrologicState:
    """Output of the infiltration model."""

    infiltration_rate_mm_h: float
    cumulative_infiltration_mm: float
    wetting_front_depth_m: float
    effective_saturation_0_1: float


@dataclass
class PorePressureResult:
    u_kpa: float
    status: str  # "ESTIMATED" | "UNAVAILABLE"


@dataclass
class PhysicsOutput:
    """Mirrors contract section 3.3 / section 16 physics_output block exactly."""

    physics_status: str  # AVAILABLE / PARTIAL / UNAVAILABLE
    physics_model_version: str
    infiltration_rate_mm_h: Optional[float]
    cumulative_infiltration_mm: Optional[float]
    wetting_front_depth_m: Optional[float]
    effective_saturation_0_1: Optional[float]
    pore_pressure_kpa: Optional[float]
    pore_pressure_status: str  # ESTIMATED / MEASURED / UNAVAILABLE
    effective_normal_stress_kpa: Optional[float]
    driving_shear_stress_kpa: Optional[float]
    resisting_shear_strength_kpa: Optional[float]
    factor_of_safety: Optional[float]
    stability_state: Optional[str]  # STABLE / MARGINAL / UNSTABLE / UNKNOWN
    physics_validity_flags: list = field(default_factory=list)

    def to_json_dict(self) -> dict:
        return {
            "physics_status": self.physics_status,
            "physics_model_version": self.physics_model_version,
            "infiltration_rate_mm_h": self.infiltration_rate_mm_h,
            "cumulative_infiltration_mm": self.cumulative_infiltration_mm,
            "wetting_front_depth_m": self.wetting_front_depth_m,
            "effective_saturation_0_1": self.effective_saturation_0_1,
            "pore_pressure_kpa": self.pore_pressure_kpa,
            "pore_pressure_status": self.pore_pressure_status,
            "effective_normal_stress_kpa": self.effective_normal_stress_kpa,
            "driving_shear_stress_kpa": self.driving_shear_stress_kpa,
            "resisting_shear_strength_kpa": self.resisting_shear_strength_kpa,
            "factor_of_safety": self.factor_of_safety,
            "stability_state": self.stability_state,
            "physics_validity_flags": self.physics_validity_flags,
        }
