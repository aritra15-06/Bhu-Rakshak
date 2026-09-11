# Scaling notes: one model, ~100 monitored locations

## The actual mechanism

The naive approach — one trained model per monitored location — was
correctly identified as inefficient and was **not** built. Instead:

1. **`location_id` is never a model input feature.** It is a join/tracing
   key only (see `ml/feature_manifest.py`, comment above `FEATURE_NAMES`).
   The model has no per-location weight, embedding, or lookup table tied
   to a specific site.

2. **The model generalizes through covariates, not identity.** Every
   location is represented to the model purely by its terrain
   (`slope_deg`, `elevation_m`, curvature, flow accumulation...), soil
   (`clay_percent`, `bulk_density_kg_m3`...), historical-landslide density,
   rainfall time series, and physics-engine outputs (`factor_of_safety`,
   `pore_pressure_kpa`...) computed fresh for that location at that
   analysis time. Two different physical locations with similar terrain
   and similar current rainfall get similar predictions — that similarity
   is exactly what lets a model trained on a few hundred (synthetic +
   real) location-time rows say something about a location it has never
   seen, as long as that location's parameters fall in a broadly similar
   regime.

3. **One process, one loaded model, many calls.** `service/prediction_service.py`'s
   `PredictionService` class loads the trained XGBoost model + sigmoid
   calibrator exactly once (`PredictionService.load_default()`). Every
   call to `predict_location(...)` reuses those same in-memory objects.
   `predict_many(...)` is a thin loop over that same instance. There is
   no per-location model file, no per-location training job, and no
   growth in deployed-model count as coverage grows from 3 pilot sites to
   ~100 monitored sites — only a growth in the *number of feature-vector
   dicts you pass in*.

4. **Empirically demonstrated in `demo/run_demo_predictions.py`.** The
   script scores a simulated batch of 100 distinct locations through one
   `PredictionService` instance. On this build sandbox that ran in well
   under a second total (~7 ms/location) — see
   `demo/sample_predictions/_100_location_batch_summary.json` for the
   actual numbers from the last run. This is not a proof that the
   *predictions* are accurate for 100 real NER sites (see the honesty
   section below) — it is a proof that the *architecture* scales the way
   you asked for: one shared model, arbitrarily many locations scored
   per cycle, cheaply.

## What would actually make this "production" at ~100 real sites

This prototype's scaling story is architecturally correct but the
*training data* behind it is not yet real-world-representative at that
scale. To go from "the code can score 100 locations from one model" to
"the predictions at 100 real locations are trustworthy," the team would
still need to, in priority order:

1. Replace/augment the synthetic dataset with real NRSC/ISRO Landslide
   Atlas + GSI events, properly time/geography-split, per contract
   section 7 and section 12.
2. Widen the real DEM/SoilGrids/rainfall coverage beyond the 2-3 demo
   pilot zones so the ~100 real monitored locations actually get
   real (not placeholder) terrain/soil parameters — this is explicitly
   flagged as out-of-scope for the 2-day round in the Work Distribution
   doc, and rightly so.
3. Periodically retrain via the loop in `ml/retrain.py` as field
   verifications accumulate across all monitored sites, not just the 3
   demo sites, so the model's effective training coverage grows toward
   the full monitored set over time.
4. Re-run the GroupKFold generalization check (`ml/split.py`) against the
   real inventory once available, since the current PR-AUC delta
   (physics features helping baseline) is measured on the synthetic
   labeling function, not verified events.

None of that changes the JSON contract, the physics engine interface, or
the `PredictionService` API — it only changes what data feeds them,
which is exactly the separation of concerns the contract's "Physics
Engine vs XGBoost, deterministic vs supervised" framing was designed to
protect.
