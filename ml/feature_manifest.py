"""
Feature manifest for the XGBoost hazard classifier.

Per contract section 12 step 4: "Build the final feature matrix and a
feature-manifest file listing name, unit, source, calculation,
missing-value policy, and leakage rule."

This is the single source of truth for which columns the model consumes.
dataset.py, train.py, and service/prediction_service.py all import this
list so the feature schema cannot silently drift between training and
inference (contract section 23: "No feature may use information that was
not available at analysis_time_utc").
"""

from __future__ import annotations

FEATURE_SCHEMA_VERSION = "4.0.0"

# (name, unit, source, calculation, missing_value_policy, leakage_rule)
FEATURE_MANIFEST = [
    # --- Rainfall / temporal trigger (contract section 5) ---
    ("rainfall_1h_mm", "mm", "GPM_IMERG_or_synthetic",
     "sum of rainfall in the 1h ending at analysis_time_utc",
     "0.0 if missing window, flag data_quality", "only rainfall at-or-before analysis_time_utc"),
    ("rainfall_3h_mm", "mm", "GPM_IMERG_or_synthetic", "sum, 3h window", "0.0 if missing", "same"),
    ("rainfall_6h_mm", "mm", "GPM_IMERG_or_synthetic", "sum, 6h window", "0.0 if missing", "same"),
    ("rainfall_12h_mm", "mm", "GPM_IMERG_or_synthetic", "sum, 12h window", "0.0 if missing", "same"),
    ("rainfall_24h_mm", "mm", "GPM_IMERG_or_synthetic", "sum, 24h window", "0.0 if missing", "same"),
    ("rainfall_72h_mm", "mm", "GPM_IMERG_or_synthetic", "sum, 72h window", "0.0 if missing", "same"),
    ("rainfall_7d_mm", "mm", "CHIRPS_or_synthetic", "sum, 7-day window", "0.0 if missing", "same"),
    ("rainfall_30d_mm", "mm", "CHIRPS_or_synthetic", "sum, 30-day window", "0.0 if missing", "same"),

    # --- Terrain (static) ---
    ("elevation_m", "m", "SRTM_Copernicus_DEM_or_synthetic", "DEM sample at cell centroid",
     "impute cell-median; flag", "static, no leakage risk"),
    ("slope_deg", "degrees", "DEM_derivative_or_synthetic", "slope from DEM",
     "impute cell-median; flag", "static"),
    ("aspect_sin", "unitless [-1,1]", "DEM_derivative_or_synthetic", "sin(aspect_deg)",
     "0.0 if missing", "static"),
    ("aspect_cos", "unitless [-1,1]", "DEM_derivative_or_synthetic", "cos(aspect_deg)",
     "0.0 if missing", "static"),
    ("plan_curvature", "1/m", "DEM_derivative_or_synthetic", "plan curvature from DEM",
     "0.0 if missing", "static"),
    ("profile_curvature", "1/m", "DEM_derivative_or_synthetic", "profile curvature from DEM",
     "0.0 if missing", "static"),
    ("flow_accumulation_m2", "m^2", "DEM_derivative_or_synthetic", "upslope contributing area",
     "impute cell-median", "static"),
    ("distance_to_stream_m", "m", "DEM_derivative_or_synthetic", "distance to nearest stream",
     "impute cell-median", "static"),

    # --- Soil / land surface ---
    ("clay_percent", "%", "SoilGrids_or_synthetic", "SoilGrids depth-interval sample",
     "impute regional-median; flag", "static"),
    ("sand_percent", "%", "SoilGrids_or_synthetic", "SoilGrids depth-interval sample",
     "impute regional-median; flag", "static"),
    ("silt_percent", "%", "SoilGrids_or_synthetic", "SoilGrids depth-interval sample",
     "impute regional-median; flag", "static"),
    ("bulk_density_kg_m3", "kg/m^3", "SoilGrids_or_synthetic", "SoilGrids depth-interval sample",
     "impute regional-median; flag", "static"),
    ("ndvi_summary", "unitless [-1,1]", "satellite_or_synthetic", "recent NDVI composite",
     "impute regional-median; flag", "static/slow-changing"),

    # --- Historical context ---
    ("nearest_historical_landslide_distance_m", "m", "NRSC_ISRO_Atlas_or_synthetic",
     "distance to nearest pre-analysis_time historical event",
     "large sentinel value (999999) if none known", "only events with event_time < analysis_time_utc"),
    ("historical_landslide_count_1km_5y", "count", "NRSC_ISRO_Atlas_or_synthetic",
     "count of events within 1km, prior 5y", "0 if none", "same"),
    ("historical_landslide_count_5km_5y", "count", "NRSC_ISRO_Atlas_or_synthetic",
     "count of events within 5km, prior 5y", "0 if none", "same"),

    # --- Physics-derived (contract section 5: "Physics-informed ML features") ---
    ("factor_of_safety", "dimensionless", "physics_engine",
     "infinite_slope_effective_stress_v1.0 output", "drop row if physics_status==UNAVAILABLE",
     "recomputed at analysis_time_utc using only rainfall at-or-before that time"),
    ("pore_pressure_kpa", "kPa", "physics_engine", "physics_engine output",
     "drop row if physics_status==UNAVAILABLE", "same"),
    ("effective_saturation_0_1", "0-1", "physics_engine", "physics_engine output",
     "drop row if physics_status==UNAVAILABLE", "same"),
    ("infiltration_rate_mm_h", "mm/h", "physics_engine", "physics_engine output",
     "drop row if physics_status==UNAVAILABLE", "same"),
    ("cumulative_infiltration_mm", "mm", "physics_engine", "physics_engine output",
     "drop row if physics_status==UNAVAILABLE", "same"),
]

FEATURE_NAMES = [row[0] for row in FEATURE_MANIFEST]

# Environmental-only baseline (no physics) vs full feature set, per contract
# section 5: "train two models: (A) environmental-only baseline and
# (B) environmental + physics-derived features."
PHYSICS_FEATURES = [
    "factor_of_safety", "pore_pressure_kpa", "effective_saturation_0_1",
    "infiltration_rate_mm_h", "cumulative_infiltration_mm",
]
ENVIRONMENTAL_ONLY_FEATURES = [f for f in FEATURE_NAMES if f not in PHYSICS_FEATURES]

# location_id is a join/tracing key and grouping key for CV — it is
# deliberately NOT included as a raw categorical feature. The model
# generalizes across locations via the terrain/soil/rainfall covariates
# above, not by memorizing a per-location identity. This is the mechanism
# that lets one trained model serve ~100 monitored locations instead of
# needing 100 separate models (see docs/scaling_notes.md).


def manifest_as_records():
    return [
        {
            "name": n, "unit": u, "source": s, "calculation": c,
            "missing_value_policy": m, "leakage_rule": l,
        }
        for (n, u, s, c, m, l) in FEATURE_MANIFEST
    ]
