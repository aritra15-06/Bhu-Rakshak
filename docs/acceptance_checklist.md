# Acceptance checklist — verified against contract section 25

Each item checked against actual code/output in this build, not assumed.
"VERIFIED" means I ran something and looked at the result. "ARCHITECTURE
ONLY" means the interface/mechanism exists but isn't exercised against
real production data in this sandbox — that distinction matters, don't
blur it on stage.

- [x] **Physics Engine produces deterministic outputs for the same
  inputs and returns validity flags.**
  VERIFIED — `tests/test_physics_engine.py::test_determinism` and
  `::test_invalid_inputs_flagged_not_substituted` both pass.

- [x] **Physics-derived features used by XGBoost are available before
  the forecast horizon begins.**
  VERIFIED by construction — `ml/dataset.py` only ever passes
  `rainfall_series[:idx+1]` (rain up to and including the analysis hour)
  into `run_physics()`; no future rainfall enters the physics call.

- [x] **All training rows have a declared analysis_time_utc and
  forecast_horizon_hours.**
  VERIFIED — both are set unconditionally per row in `ml/dataset.py`
  (`forecast_horizon_hours` fixed at 24 for the whole training run, per
  contract section 12 step 1).

- [x] **Unknown labels are not silently converted to negative labels.**
  VERIFIED — `ml/labels.py::filter_eligible_rows` only keeps rows where
  `verification_status == "VERIFIED"` and the label is in `{0,1}`;
  nothing coerces UNKNOWN to 0. (In this synthetic dataset every row is
  constructed as VERIFIED by design — see honesty note below — but the
  filter is exercised and will behave correctly once real UNKNOWN rows
  exist.)

- [x] **CV is time/geography aware enough to prevent leakage from the
  same storm or nearby duplicate cells.**
  VERIFIED — `ml/split.py` uses `GroupKFold` keyed on `location_id` for
  both the dev/test holdout and the GridSearchCV inner CV, so no
  location's rows ever appear in both train and validation/test.

- [x] **The final test set remains untouched during hyperparameter
  selection and calibration.**
  VERIFIED — `ml/train.py::main` calls `location_holdout_split` once,
  before any grid search; the test split is only touched by `evaluate()`
  after fitting, and calibration is fit on a separate validation split
  carved out of dev, not test.

- [x] **GridSearchCV has a declared primary metric appropriate for class
  imbalance.**
  VERIFIED — `scoring="average_precision"` (PR-AUC) in
  `ml/train.py::run_grid_search`, matching contract section 13's stated
  preference over ROC-AUC/accuracy under imbalance.

- [x] **Calibrated probability is generated from data independent of
  base-model fitting.**
  VERIFIED — `ml/train.py::calibrate_model` calibrates on `X_val/y_val`,
  the early-stopping validation split carved out of dev and excluded
  from the tree-fitting rows (`X_fit/y_fit`).

- [x] **Raw JSON includes model/feature/physics versions and
  traceability metadata.**
  VERIFIED — see any file in `demo/sample_predictions/`; `model.*`,
  `traceability.*` populated exactly per contract section 16.

- [x] **Impact and action are downstream computations, not XGBoost
  outputs.**
  VERIFIED — `service/schemas.py::validate_raw_prediction_json` actively
  asserts risk_score/confidence/affected_*/action/impact are NOT present
  at top level, and this validator runs on every prediction
  (`prediction_service.py` raises if it fails).

- [x] **The retraining pipeline adds only verified outcomes and
  preserves the previous champion model.**
  ARCHITECTURE ONLY — `ml/retrain.py` implements duplicate-safe
  append, a promotion gate, and champion backup-before-overwrite, and
  each function works in isolation, but there is no scheduled job wired
  to a live feedback database in this 2-day build (matches Work
  Distribution doc's explicit cut: "Real-time ML training / large-scale
  data pipeline").

- [ ] **Dashboard/SMS/demo values have been human-checked before
  presentation.**
  NOT DONE BY ME — this is explicitly Aastha's role per the Work
  Distribution doc's LLM ground rules table, and it can only happen once
  the dashboard/SMS/Action Engine (other teammates' work) exist to
  check. Flagging it unchecked rather than silently marking it done.

## Honesty notes not in the original checklist but load-bearing

- **The dataset is synthetic.** Every "VERIFIED" label above regarding
  the ML pipeline is about the *pipeline's correctness*, not about
  real-world predictive accuracy. See `ml/dataset.py` module docstring
  and `artifacts/metrics/xgb_landslide_v1.0_metrics.json`'s
  `IMPORTANT_data_provenance_notice` field — that field is in the saved
  metrics file specifically so it can't be quietly dropped when someone
  copies numbers into a slide.
- **PR-AUC 0.78 (physics-augmented, held-out unseen locations) vs 0.31
  (environmental-only baseline)** is a real, reproducible result on this
  synthetic corpus, and it's a legitimate thing to show a judge as
  *"physics-informed features measurably help the model generalize to
  unseen locations, even before real event data is incorporated."* It is
  not legitimate to present as *"84% accurate landslide predictions."*
  Say the first sentence, not the second.
