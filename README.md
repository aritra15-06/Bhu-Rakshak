# Bhu-Rakshak — Complete System

Physics-informed, XGBoost-driven landslide early-warning system: a full
FastAPI backend and React dashboard implementing the plan in
`docs/implementation_plan.md`, wired to the real physics engine and
trained model from `physics/` and `ml/`.

## Quick start (one click)

**Mac/Linux**: double-click `Start_Bhu-Rakshak.command`.
First time only: right-click it → Open (macOS Gatekeeper), or run
`chmod +x Start_Bhu-Rakshak.command` once in a terminal, then double-click
normally from then on.

**Windows**: double-click `Start_Bhu-Rakshak.bat`.

Either launcher installs dependencies on first run (needs Python 3.10+ and,
if the frontend isn't already built, Node.js — see `frontend/dist/` below),
starts the backend, waits until it responds, and opens your default browser
to the dashboard automatically. Keep the terminal window open while
presenting; closing it stops the server.

**Manual start**, if you'd rather run it yourself — **but read this first**:
if you have ever seen the error `TypeError: Router.__init__() got an
unexpected keyword argument 'on_startup'`, it means some other Python
project on this machine already installed a newer `starlette` than the
`fastapi` version currently installed can work with. Running the launcher
(`Start_Bhu-Rakshak.command` / `.bat`) fixes this automatically, every
time, before starting the server. If you skip the launcher and run
`uvicorn` directly yourself, you skip that fix too, and you WILL see the
same crash again even after the launcher has "fixed" things once — the
launcher's fix only takes effect through the launcher's own steps, not
system-wide. Run this once, manually, before your first manual `uvicorn`
call, and every time after using `pip install` for anything else in this
project:
```bash
pip install --force-reinstall --no-deps fastapi==0.110.0 starlette==0.36.3 "uvicorn[standard]==0.29.0"
```
Then:
```bash
pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..
python3 -m uvicorn backend.main:app --host 127.0.0.1 --port 8731
```
Then open `http://127.0.0.1:8731` in your browser.

## What you'll see

- **Dashboard tab**: sidebar of all 6 monitored sites, a 2D map (real
  OpenStreetMap tiles — needs internet access) or 3D terrain view (works
  offline, synthetic terrain by default), and a per-site panel with
  simulation sliders, live physics/ML results, severity, confidence, and
  SHAP feature explanations.
- **Alerts tab**: register demo contacts with a phone number, GPS position,
  and preferred language; send distance-tiered SMS alerts (dry-run by
  default, no credentials needed).
- **Training tab**: trigger a real retraining run and watch real progress.
- **Citizen reports tab**: submit and mark-verified field reports.

## Before presenting to judges — read this

1. **The 3D terrain is synthetic**, clearly labeled as such in the UI (a
   visible badge over the 3D view). It was generated because this build
   environment had no OpenTopography API key or general internet access.
   Run `python3 terrain3d/fetch_dem.py --api-key YOUR_KEY` (get a free key
   at opentopography.org) before your demo to replace it with real
   elevation data — the frontend needs no changes either way.
2. **Live SMS needs your Twilio credentials.** Set `TWILIO_ACCOUNT_SID`,
   `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` as environment variables
   before launching, and pre-verify every recipient number in your Twilio
   trial console. Without these set, the Alerts panel works in dry-run
   only — which is a completely legitimate way to demo it.
3. **Hindi/Nepali/Bengali SMS templates were machine-translated** — have a
   fluent speaker check them (`alerts/language_templates.py`) before any
   real send.
4. **The severity score is an engineered heuristic, not a validated
   magnitude model.** See `backend/severity.py`'s docstring and
   `docs/acceptance_checklist.md` for exactly what to say and not say if
   a judge asks about it.
5. **The training dataset is synthetic.** PR-AUC numbers shown in
   `artifacts/metrics/` measure whether the pipeline learned the
   documented synthetic labeling function, not real-world predictive
   skill. Full honesty notes in `ml/dataset.py` and
   `docs/acceptance_checklist.md`.
6. **The Impact Engine uses Shapely + seed JSON files, not a live
   PostGIS database** (see `gis/impact_engine.py` docstring) — the
   spatial computation is real and correct, the storage layer is a
   substitution documented in the code. `gis/impact_queries.sql` has the
   real PostGIS queries if your team stands up a real database before
   the demo.

## Repository layout

```
physics/          Deterministic Factor-of-Safety physics engine
ml/                Training pipeline (dataset, GridSearchCV, calibration, explain, retrain)
service/           PredictionService — loads the model once, serves any number of locations
backend/           FastAPI app: routes, severity/confidence scoring, per-site state, training jobs
gis/               Impact Engine (Shapely) + PostGIS reference queries + seed village/road data
action/            Action Engine decision grid + authored citizen messages
alerts/            Distance-tiered SMS dispatch, multi-language templates, Twilio sender
terrain3d/         Synthetic heightmap generator + real-DEM fetch script
frontend/          React + Vite dashboard (Leaflet map, Three.js terrain, all panels)
demo/              Pilot location definitions, sample predictions
docs/              implementation_plan.md, scaling_notes.md, acceptance_checklist.md
tests/             Physics engine + prediction service test suites
artifacts/         Trained model, calibrator, metrics (pre-built, ready to use)
Start_Bhu-Rakshak.command / .bat   One-click launchers
```

## Running tests

```bash
python3 tests/test_physics_engine.py       # 8 tests: determinism, synthetic-case directional checks
python3 tests/test_prediction_service.py   # 3 tests: contract compliance, no-fabrication on missing physics
```

## Retraining the model manually

```bash
python3 -m ml.train
```
Takes 3–5 minutes (real GridSearchCV over environmental-only vs.
physics-augmented feature sets). The Training tab in the dashboard runs
this same command as a background job with live progress.

## For your team

If you're extending this rather than just presenting it, start with
`docs/implementation_plan.md` (the full design document this system was
built from) and `docs/acceptance_checklist.md` (what's verified vs.
architecture-only, and the exact caveats to state to judges).
