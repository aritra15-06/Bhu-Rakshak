#!/usr/bin/env bash
# Bhu-Rakshak Physics + XGBoost build — reproducible run script.
#
# Usage: bash run_all.sh
# From a fresh checkout, this: installs deps, runs physics unit tests,
# builds the synthetic training dataset, trains + calibrates the model,
# runs the prediction-service integration tests, then scores the 3 real
# pilot locations plus a simulated 100-location batch.
#
# Expected total runtime on modest hardware: ~3-5 minutes, dominated by
# GridSearchCV. If it's much slower on your machine, reduce
# ml/train.py's FAST_PARAM_GRID or n_synthetic_cells in ml/dataset.py.

set -e
cd "$(dirname "$0")"

echo "=== 1/5: Installing dependencies ==="
pip install -r requirements.txt --quiet

echo ""
echo "=== 2/5: Physics engine synthetic-case tests ==="
python3 tests/test_physics_engine.py

echo ""
echo "=== 3/5: Training pipeline (dataset build + GridSearchCV + calibration) ==="
python3 -m ml.train

echo ""
echo "=== 4/5: Prediction service integration tests ==="
python3 tests/test_prediction_service.py

echo ""
echo "=== 5/5: Demo predictions (3 pilot locations + 100-location scaling batch) ==="
python3 -m demo.run_demo_predictions

echo ""
echo "=== Done ==="
echo "Model artifacts:      artifacts/models/, artifacts/calibration/"
echo "Metrics (READ THIS):  artifacts/metrics/xgb_landslide_v1.0_metrics.json"
echo "Sample predictions:   demo/sample_predictions/"
echo "Scaling proof:        demo/sample_predictions/_100_location_batch_summary.json"
