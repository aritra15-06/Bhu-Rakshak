# Bhu-Rakshak — Complete System Implementation Plan
### Dashboard, Simulation Console, Alerts, 3D Terrain, and Integration Guide

Version 2.0 — for the SIH internal presentation round

---

## 0.0 What changed in v2.0

| Request | What was added | Section |
|---|---|---|
| Show which road/intersection is affected on the map | Clarified this is the **existing** Impact Engine's output, now rendered as a map layer — not new backend work | 2.4 |
| Confidence level display | New `backend/confidence.py` — assembles existing data_quality/physics_status/probability-decisiveness signals into one number, computed downstream, JSON contract untouched | 2.5 |
| Severity/magnitude score (small vs. major landslide) | New `backend/severity.py` — an explicitly-labeled engineering heuristic, not a validated magnitude model. Read the honesty caveat before presenting this to judges | 2.6 |
| Real map (not placeholder) | Confirmed: Leaflet + real OpenStreetMap tiles, already implied by your original architecture doc, now made explicit | 2.7 |
| 3–6 simulation sites instead of 2–3 | `pilot_locations.json` expanded to 6 real entries, tested end-to-end | 3.4 |
| Per-site independent parameter panels, all monitored simultaneously | Simulation Console redesigned around per-location state, not one global slider set | 3 |
| Prebuilt actions per condition | New `action/action_engine.py` — an actual decision grid (probability × severity × confidence) with authored citizen messages, not a placeholder | 4 |
| Local-language SMS | **Scope decision, not a straightforward feature — read this before building it.** Language is user-selected per contact, not inferred from phone number. See Section 5.1 for why | 5 |

---


## 0. Read this first: what changed from the Work Distribution doc, and why

Your original Work Distribution doc cut CV verification, real-time training, full PostGIS, and 3D digital twin from this round, for good reasons — a 2-day sprint. This plan reintroduces some of that scope because you've asked for it explicitly, but every reintroduced piece is scoped down to something buildable, and I've flagged the scope changes so nobody on the team is surprised:

| Your ask | What's actually being built | Why scoped this way |
|---|---|---|
| "3D digital twin" | Interactive 3D terrain viewer (Three.js) for the 2–3 pilot sites, colored by live hazard state, orbitable/clickable | A true digital twin (multi-physics simulation, what-if terrain editing) is your own roadmap's **Phase 3** item. What you'll actually get is visually similar and demo-strong, but it's a *visualization*, not a simulation engine. Say "3D hazard visualization," not "digital twin," to judges — a judge who's read your own slide 6 roadmap will ask the difference. |
| "Live SMS/WhatsApp to real people" | Real Twilio SMS to pre-registered, pre-verified team-member numbers only; WhatsApp deferred | WhatsApp Business API approval takes days you don't have. Twilio trial accounts can only send to verified numbers anyway — this isn't a shortcut, it's a hard platform constraint. |
| "Train button in dashboard" | A training-trigger endpoint with real progress polling, backed by the actual `ml/train.py` pipeline you already have, run against the synthetic+pilot dataset | Full retraining takes ~3–5 minutes (real GridSearchCV). The UI will show real progress, not a fake spinner — but don't trigger it live mid-demo unless you've rehearsed the exact timing; have a pre-trained model ready as the default state. |
| "Simulate random conditions, model responds instantly" | A parameter-tweak panel that calls the real prediction service synchronously (typical response time under 200ms per location) | This is the strongest part of your ask and the plan leans on it hard — see Section 3. |
| Distance-tiered alerts | Real PostGIS/Shapely point-in-buffer computation against a small seeded population-point table for the 2–3 demo zones | Matches the Impact Engine your Work Distribution doc already assigned to Sanit — this plan specifies the interface, not a duplicate build. |

If your team is short on time on Day 2, cut in this order: WhatsApp (already deferred) → 3D terrain → training-trigger UI → distance-tiered alert precision (fall back to a single flat radius). Do not cut the simulation dashboard — it's your answer to "how do we prove this works without live data," which is the right instinct and the centerpiece of a convincing demo.

---

## 1. System architecture overview

```
                        ┌─────────────────────────────────────────┐
                        │         SIMULATION CONSOLE (React)        │
                        │  sliders: rainfall, saturation, per-site  │
                        └───────────────┬───────────────────────────┘
                                        │ POST /predict (synchronous)
                                        ▼
┌──────────────┐   ┌──────────────────────────────┐   ┌───────────────────────┐
│  Physics      │──▶│   FastAPI Backend             │──▶│  XGBoost Model         │
│  Engine       │   │   (prediction_service.py      │   │  + Calibrator          │
│  (Aritra)     │   │    wrapped in HTTP routes)     │   │  (Aritra)              │
└──────────────┘   └───────────┬──────────┬─────────┘   └───────────────────────┘
                                │          │
                    raw JSON contract      │
                    (v4.0.0, unchanged)    │
                                │          │
                ┌───────────────▼──┐   ┌──▼────────────────────┐
                │  Impact Engine    │   │  Action Engine          │
                │  (PostGIS,        │   │  (rules: WATCH/PREPARE/ │
                │   Sanit)          │   │   RESTRICT/EVACUATE)    │
                └───────┬───────────┘   └──────────┬──────────────┘
                        │                           │
                        ▼                           ▼
              affected villages/roads      operational action + reason
                        │                           │
                        └─────────────┬─────────────┘
                                      ▼
                        ┌──────────────────────────────┐
                        │   Alert Dispatch Service       │
                        │   (Sanit) — distance-tiered    │
                        │   SMS via Twilio                │
                        └──────────────┬───────────────────┘
                                      ▼
                            registered team phones (demo)

                        ┌──────────────────────────────┐
                        │   Dashboard (React+Leaflet)    │
                        │   (Sayan) — 2D map, Action Card│
                        │   + 3D terrain panel (Three.js)│
                        │   + Simulation Console          │
                        │   + Training Trigger UI         │
                        └──────────────────────────────┘
                                      ▲
                                      │
                        ┌──────────────────────────────┐
                        │   Citizen Report Form + list    │
                        │   (Soumodip)                     │
                        └──────────────────────────────┘
```

Everyone still owns exactly what the Work Distribution doc assigned. This plan adds: (1) a FastAPI layer around the already-built `PredictionService` so the dashboard can call it over HTTP instead of importing Python directly, (2) a Simulation Console panel, (3) a Training Trigger panel, (4) a 3D terrain viewer, (5) an Alert Dispatch service with distance tiers and a phone-number registration panel.

---

## 2. FastAPI backend — the one new shared piece

This is the thing that turns your already-working `service/prediction_service.py` into something the dashboard can call from the browser. Build this first — everything else depends on it.

### 2.1 Folder structure addition

```
bhurakshak/
├── physics/                  (existing, unchanged)
├── ml/                       (existing, unchanged)
├── service/                  (existing, unchanged — PredictionService untouched)
├── backend/                  (NEW)
│   ├── main.py                 FastAPI app, CORS, startup model load
│   ├── routes/
│   │   ├── predict.py           POST /api/predict, POST /api/predict/batch
│   │   ├── simulate.py          POST /api/simulate  (parameter override endpoint)
│   │   ├── train.py             POST /api/train/start, GET /api/train/status/{job_id}
│   │   ├── alerts.py             POST /api/alerts/send, GET/POST /api/contacts
│   │   ├── impact.py             GET /api/impact/{location_id}  (proxies Sanit's Impact Engine)
│   │   └── locations.py          GET /api/locations  (pilot site list + static params)
│   ├── models/
│   │   ├── training_jobs.py      in-memory job-status tracker (dict is fine for a demo)
│   │   └── contacts_store.py     in-memory or SQLite contact list
│   ├── websocket.py             (OPTIONAL) push live updates to dashboard without polling
│   └── config.py                Twilio credentials, CORS origins, model paths
├── frontend/                 (NEW — Sayan + Soumodip's React app)
├── alerts/                   (NEW — Sanit's SMS dispatch logic)
├── gis/                       (existing — Sanit's Impact Engine, unchanged interface)
└── terrain3d/                 (NEW — 3D viewer assets and DEM processing)
```

### 2.2 Core endpoints (the contract your frontend team builds against)

**`GET /api/locations`**
Returns the pilot location list (from `demo/pilot_locations.json`) plus current static parameters. This is what populates the dashboard's site picker and the Simulation Console's starting sliders.

```json
{
  "locations": [
    {"location_id": "LOC01", "name": "Chungthang corridor", "latitude": 27.599, "longitude": 88.6483,
     "current_params": { "slope_deg": 34.0, "cohesion_kpa": 6.0, "...": "..." }}
  ]
}
```

**`POST /api/predict`**
Body: `{ "location_id": "LOC01" }` — runs a prediction using the location's *currently stored* parameters (whatever the Simulation Console last set, or the defaults). Returns the exact raw JSON contract from `PredictionService.predict_location()`, unchanged. This is a thin wrapper — do not reshape the JSON here, or you reintroduce the exact integration-drift risk your JSON Contract doc was written to prevent.

**`POST /api/simulate`**
This is the panel you specifically asked for. Body:
```json
{
  "location_id": "LOC01",
  "overrides": {
    "rainfall_1h_mm": 25.0,
    "rainfall_24h_mm": 180.0,
    "initial_saturation_0_1": 0.7,
    "slope_deg": 40.0
  }
}
```
Server-side: merges `overrides` onto the location's stored baseline parameters, calls `PredictionService.predict_location()` synchronously with the merged state, returns the same raw JSON contract. Typical latency budget: under 200ms (matches what you already measured — 6.9ms per prediction call once the model is loaded; the rest is network + JSON serialization overhead). **This does not retrain or refit anything** — it's the same trained model scoring a different input, which is exactly what "the model responds instantly when I change parameters" means and is architecturally the correct way to do it. Do not confuse this with the training-trigger panel below; conflating the two is a common demo-day mistake that makes judges think you're retraining live (which the contract explicitly tells you never to do on stage).

**`POST /api/train/start`**
Kicks off `ml/train.py`'s pipeline as a background process. Returns `{"job_id": "..."}` immediately. Real run time on your hardware: budget 3–5 minutes based on your own measured GridSearchCV timing. Do not shrink this to look instant — a visibly real multi-minute progress bar is more convincing to judges than a suspiciously instant "training complete."

**`GET /api/train/status/{job_id}`**
Poll this every 2–3 seconds from the dashboard. Returns:
```json
{
  "job_id": "...", "status": "RUNNING",
  "stage": "grid_search_model_B",
  "progress_pct": 62,
  "log_tail": ["[B_environmental_plus_physics] GridSearchCV done in 71.2s...", "..."]
}
```
Implementation: run `ml/train.py`'s `main()` in a subprocess, redirect stdout to a log file per job, and have the status endpoint tail that file and pattern-match on the print statements `ml/train.py` already emits (`GridSearchCV done in`, `Selected model for deployment`, etc.) to estimate stage/progress. This is not sophisticated, but it is honest — every logged line is something the pipeline actually did.

**`POST /api/alerts/send`** and **`GET/POST /api/contacts`** — see Section 5.

**`GET /api/impact/{location_id}`** — thin proxy to whatever Sanit's Impact Engine exposes (a Python function call or its own small FastAPI route); this file exists so the dashboard has one consistent base URL and doesn't need to know which teammate owns which service internally.

### 2.3 main.py skeleton

```python
# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from service.prediction_service import PredictionService
from backend.routes import predict, simulate, train, alerts, impact, locations

app = FastAPI(title="Bhu-Rakshak API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Load the model ONCE at startup — this IS the "one model serves many
# locations" mechanism from service/prediction_service.py, now exposed
# over HTTP instead of direct Python import.
prediction_service = PredictionService.load_default()
app.state.prediction_service = prediction_service

app.include_router(locations.router, prefix="/api")
app.include_router(predict.router, prefix="/api")
app.include_router(simulate.router, prefix="/api")
app.include_router(train.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(impact.router, prefix="/api")
```

### 2.4 Map layer for affected roads/intersections — this is not new backend work

You asked whether the system can show *which* road or intersection is affected. It already can, architecturally — this was scoped to Sanit's Impact Engine in your original Work Distribution doc (`ST_Intersects` against a roads table). What's new here is only the **rendering**, not the computation:

- `GET /api/impact/{location_id}` (already specified in Section 2.2) returns the affected villages/roads from Sanit's PostGIS query.
- The dashboard draws these as a highlighted GeoJSON layer on the Leaflet map — the affected road segment rendered in a distinct color (e.g. red dashed line), with the intersection point marked, directly from the geometry PostGIS already returns.
- **Do not build a second "which road is affected" computation in the frontend or in `backend/`.** If you find yourself writing spatial intersection logic anywhere other than `gis/impact_engine.py`, stop — that's duplicated, driftable logic, exactly what your JSON contract doc was written to prevent.

```jsx
// frontend/src/components/ImpactLayer.jsx
function ImpactLayer({ locationId }) {
  const [impact, setImpact] = useState(null);
  useEffect(() => {
    fetch(`/api/impact/${locationId}`).then(r => r.json()).then(setImpact);
  }, [locationId]);
  if (!impact) return null;
  return (
    <>
      <GeoJSON data={impact.affected_roads_geojson} style={{ color: 'red', dashArray: '6' }} />
      {impact.affected_villages.map(v => (
        <Marker key={v.id} position={[v.lat, v.lon]}><Popup>{v.name} — {v.population} people</Popup></Marker>
      ))}
    </>
  );
}
```

### 2.5 Confidence display — assembling what already existed

The raw prediction JSON already carries every signal needed to judge confidence (`data_quality.*`, `physics_output.physics_status`/`physics_validity_flags`, and how decisively `ml_output.calibrated_probability` sits away from the 0.5 threshold) — but nothing previously combined them into one number for display. That gap is fixed now with `backend/confidence.py`:

```python
from backend.confidence import assemble_confidence

confidence_result = assemble_confidence(raw_prediction_json)
# -> ConfidenceResult(confidence_0_1=0.72, confidence_band="HIGH",
#                      reasons=["Data quality checks passed, physics engine fully ..."])
```

This is a **separate downstream object**, returned alongside the raw prediction JSON in the `/api/predict` and `/api/simulate` response envelope — never merged into it:

```json
{
  "prediction": { /* ... exact existing JSON contract, unchanged ... */ },
  "confidence": { "confidence_0_1": 0.72, "confidence_band": "HIGH", "reasons": ["..."] },
  "severity": { /* see 2.6 */ }
}
```

Update `routes/predict.py` and `routes/simulate.py` to wrap the response this way. The dashboard reads `response.prediction.*` exactly as before, plus `response.confidence.*` and `response.severity.*` as new, clearly separate fields.

### 2.6 Severity score — read this before you present it

You asked, correctly, for a way to distinguish a small slope creep from a major failure. The honest answer is: your physics engine does not currently model failure volume or runout — it models whether one representative slip plane fails, using one representative slip depth per site. Building a real magnitude/runout model is genuine additional physics work (failure geometry, volume estimation, energy-line runout methods), not a quick add.

What's built instead, in `backend/severity.py`, is a transparent **engineering heuristic**: a weighted combination of how far below 1.0 the Factor of Safety sits, how deep the slip surface is, how steep the slope is, and how intense the triggering rainfall is — each individually a physically meaningful quantity your engine already computes, combined with documented (not fitted) weights.

```python
from backend.severity import compute_severity

result = compute_severity(
    factor_of_safety=physics_output["factor_of_safety"],
    slip_depth_m=1.6,  # from the site's static parameters
    slope_deg=34.0,
    rainfall_1h_mm=environmental_features["rainfall_1h_mm"],
    rainfall_24h_mm=environmental_features["rainfall_24h_mm"],
)
# -> SeverityResult(severity_score_0_100=61.4, severity_band="MAJOR",
#                    components={...}, caveat="Engineered heuristic ... not a validated ...")
```

**What to say to judges**: "We layer a severity heuristic on top of the hazard probability, combining slip depth, slope angle, stability margin, and rainfall intensity — so a shallow marginal slope and a deep, steep, severely unstable one aren't treated identically." **What not to say**: "our system predicts landslide size/volume" — if a judge asks whether this is validated against real landslide magnitudes, the honest answer is no, and you should give that honest answer rather than overclaim.

### 2.7 Real map — confirming, not adding

Your architecture doc already specifies React + Leaflet/Mapbox for the dashboard, using real OpenStreetMap tiles — this was never a placeholder plan. If your team has been prototyping with a static image or blank canvas, switch to a real `<TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />` in `MapView.jsx` immediately; it's a one-line change and there's no reason to demo on anything else.

---


## 3. Simulation Console — per-site independent, all monitored simultaneously

This is the part of your ask that most changes the original design, so it's worth being precise about the architecture: **the model is not "one active site at a time."** `PredictionService` already scores any number of locations independently and simultaneously — that's the entire point of the scaling design from the previous deliverable (`docs/scaling_notes.md`). What changes here is the **frontend state model**, not the backend: instead of one global slider set, the dashboard holds one independent parameter state per site, and any site's sliders can be changed without affecting any other site's stored state or last prediction.

### 3.1 Site count: 3 real pilots + 3 additional simulation-only sites (6 total)

`demo/pilot_locations.json` now has 6 entries (LOC01–LOC06), spanning a spread of slope/soil/elevation conditions deliberately chosen so the demo can show a range of outcomes at once — some sites stable, some marginal, some unstable — rather than every site telling the same story. Verified end-to-end: all 6 score correctly through the existing trained model with no code changes needed (the model was already built to generalize across arbitrary location parameters, not fit to exactly 3 sites).

Mark LOC04–LOC06 clearly in the dashboard UI (e.g. a small "simulation site" badge) if you want to be transparent with judges that these three don't correspond to field-verified real coordinates — LOC01–LOC03 are your real pilot sites per the original scope, LOC04–LOC06 exist to demonstrate the system monitoring more locations at once.

### 3.2 Per-site panel interaction

```
┌─────────────────────────────────────────────────────────────────┐
│   3D / MAP VIEW                                                    │
│                                                                       │
│      ●LOC01(green)   ●LOC04(red)      ●LOC06(yellow)                 │
│                                                                       │
│              ●LOC02(red)      ●LOC03(green)    ●LOC05(green)          │
│                                                                       │
│   [click any dot to open its panel below]                             │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│  LOC04 — Chungthang-Lachen highway cut          [× close panel]    │
├─────────────────────────────────────────────────────────────────┤
│  Rainfall (1h)   [──●───────]  8 mm/h                                │
│  Rainfall (24h)   [────●─────]  60 mm                                 │
│  Antecedent sat.  [──────●───]  0.45                                   │
│  Slope angle       [───●──────]  46°                                    │
│                                                                            │
│  [Apply & Predict]   [Reset LOC04 to baseline]                            │
├─────────────────────────────────────────────────────────────────┤
│  FoS: 0.54  UNSTABLE   Probability: 85.1%   Confidence: HIGH               │
│  Severity: 71.2 (MAJOR)     Action: RESTRICT                               │
└─────────────────────────────────────────────────────────────────┘
```

Behavior:
- Clicking a dot on the 2D map (or a marker in the 3D view, see Section 6) opens **that site's panel only**. Other sites' panels, if open, remain untouched with their own independently-held parameter state.
- Every site's dot color on the map/3D view reflects **its own last prediction result**, refreshed only when that site's panel fires `/api/simulate` — changing LOC04's rainfall does not touch LOC01's stored state or displayed color.
- This means a judge can watch multiple sites simultaneously: "watch what happens if I push heavy rain into LOC04 while LOC01 and LOC05 stay calm" is now literally a supported demo move, not just a slide claim.

### 3.3 Frontend state shape

```jsx
// frontend/src/state/simulationState.js
// One entry per location_id — this IS the "monitored simultaneously,
// tweaked individually" architecture, expressed as React state.
const initialState = {
  LOC01: { overrides: {}, lastPrediction: null, lastConfidence: null, lastSeverity: null, panelOpen: false },
  LOC02: { overrides: {}, lastPrediction: null, lastConfidence: null, lastSeverity: null, panelOpen: false },
  LOC03: { overrides: {}, lastPrediction: null, lastConfidence: null, lastSeverity: null, panelOpen: false },
  LOC04: { overrides: {}, lastPrediction: null, lastConfidence: null, lastSeverity: null, panelOpen: false },
  LOC05: { overrides: {}, lastPrediction: null, lastConfidence: null, lastSeverity: null, panelOpen: false },
  LOC06: { overrides: {}, lastPrediction: null, lastConfidence: null, lastSeverity: null, panelOpen: false },
};
// applySimulation(locationId, overrides) -> POST /api/simulate -> update only that key
```

Using a single object keyed by `location_id` (rather than 6 separate `useState` calls) is deliberate — it makes "loop over every site and refresh its dot color" a one-line map operation instead of 6 hand-written cases, which matters once you're rendering 6+ markers on both the 2D map and the 3D view from the same state.

### 3.4 Demo scenarios across multiple sites

Because sites are now independently controllable, your preset-scenario buttons (Section 3.2 in the original plan — dry/monsoon/extreme) become more powerful: build a **"regional storm" preset** that applies a moderate rainfall bump to all 6 sites at once (looping the same `/api/simulate` call across all `location_id`s), then let a judge pick one or two sites to push further individually. This demonstrates both the simultaneous-monitoring claim and the per-site tweaking claim in one scripted move.

---

## 4. Action Engine — prebuilt conditions, actually written out

Your Work Distribution doc assigned the Action Engine to Sanit as "rules turning risk+confidence into WATCH/PREPARE/RESTRICT/EVACUATE" but left the actual rules and citizen-facing text unwritten. That gap is closed in `action/action_engine.py` — a real decision grid, not a placeholder:

| Calibrated probability | Severity ≥ MODERATE | Action | Confidence override |
|---|---|---|---|
| < 0.3 | any | WATCH | — |
| 0.3–0.6 | yes | PREPARE | — |
| 0.3–0.6 | no | WATCH | — |
| 0.6–0.8 | yes | RESTRICT | — |
| 0.6–0.8 | no | PREPARE | — |
| ≥ 0.8 | severity ≥ MAJOR | EVACUATE | — |
| ≥ 0.8 | severity < MAJOR | RESTRICT | — |
| any of the above | any | **capped at PREPARE** | if confidence == LOW |

The LOW-confidence cap is a deliberate safety-conservative design choice worth stating explicitly to judges: **the system will not recommend RESTRICT or EVACUATE on a signal it has itself flagged as unreliable.** This is exactly the kind of design decision that shows judges you've thought about failure modes, not just the happy path.

Each action has authored citizen-facing text (`CITIZEN_MESSAGES` dict in the same file) — WATCH through EVACUATE each get a specific, non-generic sentence. These feed directly into the SMS templates in Section 5.

This table is a starting policy, explicitly documented as adjustable in the module's docstring — rehearse with it, and if a specific demo scenario needs a different threshold to tell a cleaner story, that's a one-line change in `action_engine.py`, not a redesign.

---


## 5. Alert Dispatch — distance-tiered, multi-language SMS

Your idea (people close to the hazard get an evacuation message, people 1km away get a lighter advisory) is a legitimate application of tiered risk communication used in real early-warning systems — this is a good instinct, not just a demo trick, and it's worth saying that explicitly to judges.

### 5.1 Language selection — read this before building it

You asked for alerts in a recipient's local language, inferred from where they're "originally from," based on phone number. **This plan deliberately does not build that.** A phone number's SIM registration region does not reliably indicate either where someone currently is or what language they actually read — guessing wrong on an evacuation message during a real emergency is a safety failure, not a cosmetic one, and building the wrong version of this feature is worse than not building it.

What's built instead: each contact **explicitly selects their preferred language** in the registration panel (a dropdown — English, Hindi, Nepali, Bengali), stored with their contact record. This is simpler to build, impossible to get systematically wrong, and — worth saying to judges — is also the more realistic design for a real deployment, where residents would register their own language preference once rather than have a system guess it from a phone number pattern.

`alerts/language_templates.py` has authored templates for all three tiers (EVACUATE_NOW / PREPARE / ADVISORY) in all four languages. **These were machine-translated for this prototype and must be reviewed by a fluent speaker of each language before any real use** — the module's own docstring says this; don't skip that review even for the hackathon demo, since a garbled translation undermines credibility faster than an English-only message would.

### 5.2 Data model

```
contacts (in-memory dict or SQLite for the demo):
  contact_id, name, phone_number (E.164 format), latitude, longitude, role, preferred_language

Example (team members only, per your explicit scope):
  { "contact_id": "c1", "name": "Aritra", "phone_number": "+91XXXXXXXXXX",
    "latitude": 27.600, "longitude": 88.649, "role": "team_demo", "preferred_language": "en" }
```

### 5.3 Distance-tier + action-engine integration

The trigger condition is now the **Action Engine's output** (Section 4), not a raw probability threshold — this ties the alert system to the same decision logic driving the dashboard's Action Card, so the two never disagree in front of judges:

```python
# alerts/dispatch.py
from action.action_engine import decide_action
from backend.severity import compute_severity
from backend.confidence import assemble_confidence
from alerts.distance_tiers import classify_contacts
from alerts.language_templates import get_message
from alerts.sms_sender import send_sms

def run_alert_cycle(prediction_json: dict, environmental_features: dict, contacts: list, dry_run=True):
    confidence = assemble_confidence(prediction_json)
    severity = compute_severity(
        factor_of_safety=prediction_json["physics_output"]["factor_of_safety"],
        slip_depth_m=environmental_features["slip_depth_m"],
        slope_deg=environmental_features["slope_deg"],
        rainfall_1h_mm=environmental_features["rainfall_1h_mm"],
        rainfall_24h_mm=environmental_features["rainfall_24h_mm"],
    )
    action = decide_action(
        calibrated_probability=prediction_json["ml_output"]["calibrated_probability"],
        severity_band=severity.severity_band,
        confidence_band=confidence.confidence_band,
    )

    if action.action not in ("RESTRICT", "EVACUATE"):
        return {"sent": False, "reason": f"action={action.action}, below alert-dispatch threshold"}

    classified = classify_contacts(prediction_json, contacts)
    results = []
    for entry in classified:
        message = get_message(entry["tier"], prediction_json["location"]["location_id"],
                               language=entry["contact"]["preferred_language"])
        if dry_run:
            results.append({"to": entry["contact"]["phone_number"], "message": message, "sent": False, "dry_run": True})
        else:
            send_result = send_sms(entry["contact"]["phone_number"], message)
            results.append({"to": entry["contact"]["phone_number"], "message": message, "sent": True, **send_result})
    return {"sent": True, "action": action.action, "reason": action.reason, "recipients": results}
```

Note `distance_tiers.py`'s tier (`EVACUATE_NOW`/`PREPARE`/`ADVISORY`, based on physical distance from the hazard) and the Action Engine's action (`RESTRICT`/`EVACUATE`, based on probability/severity/confidence) are **two different, deliberately separate decisions**: the Action Engine decides *whether to alert anyone at all this cycle*; the distance tier decides *how urgently to word the message for this specific recipient*. Keep that separation in your demo narration — it's a stronger story than one flat rule ("if probability > X, text everyone the same thing").

### 5.4 Twilio integration

```python
# alerts/sms_sender.py
from twilio.rest import Client
import os

client = Client(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])
FROM_NUMBER = os.environ["TWILIO_FROM_NUMBER"]

def send_sms(to_number: str, message: str) -> dict:
    msg = client.messages.create(body=message, from_=FROM_NUMBER, to=to_number)
    return {"sid": msg.sid, "status": msg.status}
```

**Hard constraints to plan around, not discover on demo day:**
- Twilio trial accounts can only send to phone numbers you've manually verified in the Twilio console beforehand. Verify every team member's number at least a day before presenting.
- Trial messages are prefixed with "Sent from your Twilio trial account" — mention this to judges preemptively rather than let it look like a bug.
- Keep a **"Dry run" toggle** in the dashboard's alert panel that logs the exact message + recipient without calling Twilio. Rehearse with dry run on; only flip to live send once, deliberately, during the actual pitch.
- Twilio SMS supports Unicode (needed for Hindi/Nepali/Bengali script) but check message length — non-GSM-7 character sets (Devanagari, Bengali script) use multi-part SMS segments at roughly 70 characters per segment instead of 160, so a long message in these scripts may split into 2-3 SMS parts. Keep templates short (they already are, in `language_templates.py`) and test an actual send to a Devanagari-script-capable phone before the demo to confirm rendering.

### 5.5 Contact registration panel (dashboard)

```
┌─────────────────────────────────────────────┐
│  REGISTERED CONTACTS (demo only)                 │
├─────────────────────────────────────────────┤
│  Name       Phone        Language   Distance/Tier   │
│  Aritra     +91...       English ▾   ~120m [EVACUATE]│
│  Sayan      +91...       Nepali ▾    ~4.2km [—]       │
│  [+ Add contact]                                        │
├─────────────────────────────────────────────┤
│  ☐ Dry run (log only, no real SMS)                        │
│  [Send alerts now]   Last sent: —                           │
└─────────────────────────────────────────────┘
```

Distance-from-site and tier columns recompute live using `classify_contacts`, so judges can watch a person's tier — and the language of the message that would be sent — change as you drag a site's rainfall slider, all from the same real computation.

---

## 6. 3D terrain visualization

Scoped explicitly as a **visualization**, not a simulation engine (see Section 0). This is Sayan's addition on top of the 2D Leaflet dashboard, built only after the core map/Action Card/PWA work is stable, per your own Day 2 sequencing.

### 6.1 Approach

- **Library**: Three.js (already listed as an available library in your build environment) with a `THREE.PlaneGeometry` displaced by real elevation data — not a generic placeholder mountain.
- **Data source**: For your 2–3 pilot sites, fetch a small DEM tile from OpenTopography's public API (already in your Data Sources list) covering roughly a 2km × 2km bounding box around each site. This is exactly the "just get it live via API" approach you asked about — DEM tiles are static terrain data, safe to fetch live even during a demo, because terrain doesn't change between rehearsal and presentation (unlike rainfall, which is why the Simulation Console overrides rainfall/saturation instead of relying on live weather APIs).
- **Coloring**: vertex colors driven by the *current* hazard state from the last prediction call for that site — green/yellow/red banding matching stability_state (STABLE/MARGINAL/UNSTABLE), refreshed whenever the Simulation Console fires a new prediction. This is what makes it feel connected to the real system rather than a static art asset.
- **Interactivity**: OrbitControls (rotate/zoom/pan) so a judge can pick the model up and look at the slope from the road side — this is the single most "wow" cheap addition for a hackathon demo, and it costs you geometry + one library, not new backend work.

### 6.2 Click-to-open per-site panel — the specific interaction you asked for

You asked: clicking a dot on the 3D model should open that site's own parameter panel, matching the per-site independent state described in Section 3. Implementation:

```jsx
// frontend/src/components/Terrain3D.jsx (scene-level, showing all 6 sites as markers)
function SiteMarker({ location, onSelect }) {
  const color = { STABLE: '#2ecc71', MARGINAL: '#f39c12', UNSTABLE: '#e74c3c', UNKNOWN: '#95a5a6' }[location.stabilityState];
  return (
    <mesh position={[location.x, location.y, location.z]} onClick={() => onSelect(location.locationId)}>
      <sphereGeometry args={[8, 16, 16]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

export default function Terrain3DScene({ sites, onSiteSelect }) {
  // sites: array of {locationId, x, y, z, stabilityState} — one per pilot location,
  // x/y/z derived from lat/lon/elevation projected onto the loaded heightmap
  return (
    <Canvas camera={{ position: [0, 400, 700], fov: 50 }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[100, 200, 100]} />
      <TerrainMesh /* base terrain mesh, see 6.3 below */ />
      {sites.map(s => <SiteMarker key={s.locationId} location={s} onSelect={onSiteSelect} />)}
      <OrbitControls />
    </Canvas>
  );
}
```

`onSiteSelect(locationId)` is the same callback the 2D map's marker `onClick` already calls (Section 3.2) — both the 2D map and the 3D scene open the identical per-site panel component from Section 3.3's state object. **Build one `SitePanel` component, mount it from both the 2D map click handler and the 3D scene click handler.** Do not build two separate panel implementations — that's the same "don't duplicate the Impact Engine logic" principle from Section 2.4, applied to the frontend.

Because your 6 sites span a real geographic area larger than any single site's 2km DEM tile (Section 6.1), the 3D scene has two reasonable options: (a) one large terrain mesh covering the full North Sikkim bounding box with all 6 site markers placed on it (visually impressive, one DEM fetch, coarser detail per site), or (b) a site-switcher dropdown that swaps in a focused 2km terrain mesh per site (finer detail, matches the original single-site design, but only shows one site's terrain at a time). Given you specifically want to click between sites and see them within one interactive model, **option (a) is what you're actually asking for** — build the wide-area mesh, not 6 separate close-up scenes.

### 6.3 Folder structure addition

```
terrain3d/
├── fetch_dem.py           One-off script: pulls ONE OpenTopography DEM tile covering
│                          the full North Sikkim bounding box containing all 6 sites,
│                          saves as GeoTIFF (see 6.2 — one wide mesh, not 6 separate ones)
├── dem_to_heightmap.py    Converts GeoTIFF to a flat Float32Array heightmap
│                          JSON the frontend can load directly
├── project_sites.py       (NEW) Projects each site's lat/lon/elevation onto the
│                          loaded heightmap's local x/y/z coordinate space, so
│                          SiteMarker positions line up with real terrain features
├── heightmaps/
│   └── north_sikkim_region_heightmap.json
└── README.md              Regeneration instructions if DEM data or site list changes
```

```python
# terrain3d/fetch_dem.py — run once ahead of the demo, NOT live on stage
import requests

def fetch_dem_tile(south, north, west, east, out_path="tile.tif"):
    url = "https://portal.opentopography.org/API/globaldem"
    params = {
        "demtype": "SRTMGL1", "south": south, "north": north,
        "west": west, "east": east,
        "outputFormat": "GTiff", "API_Key": "YOUR_KEY",
    }
    r = requests.get(url, params=params)
    with open(out_path, "wb") as f:
        f.write(r.content)

# Bounding box covering all 6 pilot sites with margin (derived from
# demo/pilot_locations.json's actual lat/lon spread):
# south=27.05, north=27.75, west=88.45, east=88.80
```

**Run this ahead of time, save the heightmap JSON into the repo, and load it as a static asset in the dashboard.** Do not call OpenTopography live during the actual judge presentation — free-tier APIs rate-limit, and a DEM fetch is slow (seconds) and terrain-static, so there's no benefit to live-fetching it under demo pressure. This is the one place where "just use a live API" is the wrong call even though you're right that live APIs are fine in general — the distinction is whether the data changes moment-to-moment (rainfall: no, use the Simulation Console) versus once-a-decade (terrain: fetch once, cache, ship the cache).

### 6.4 Base terrain mesh component

```jsx
// frontend/src/components/Terrain3D.jsx
function TerrainMesh({ heightmapData }) {
  // build geometry from heightmapData.heights (flat array) + heightmapData.width/height
  return ( /* mesh JSX, static color/texture — hazard color lives on the SiteMarker
              spheres from 6.2, not painted across the whole terrain, since 6 sites
              at different hazard states can't each recolor a shared mesh sensibly */ );
}
```

Note: `three` is available per your environment (r128) — `@react-three/fiber` and `@react-three/drei` are the standard React wrappers around it; if they're not preinstalled in your actual dashboard's build environment, use raw `three` directly instead (the mesh-building logic is identical, just without the JSX convenience wrapper).

---

## 7. Training Trigger UI

```
┌───────────────────────────────────┐
│  MODEL TRAINING                       │
├───────────────────────────────────┤
│  Current model: xgb_landslide_v1.0    │
│  Trained: 2026-09-09 18:15 UTC          │
│  Test PR-AUC: 0.78 (physics-augmented)  │
│                                          │
│  [ Retrain model ]                       │
│                                          │
│  ⏳ Training in progress...              │
│  ▓▓▓▓▓▓▓▓░░░░░░░░  Stage: GridSearchCV   │
│  (model B, environmental+physics)         │
│  Elapsed: 1m 42s                          │
└───────────────────────────────────┘
```

- **Do not trigger a real retrain live in front of judges unless rehearsed at least twice at the exact timing you'll use on stage.** A 3–5 minute dead-air wait is a real risk. Two safe patterns, pick one deliberately:
  1. Trigger it at the *start* of your pitch narration, let it run in the background while you talk through the physics engine and dashboard, and reveal the "training complete, new model deployed" toast near the end. This uses dead time productively.
  2. Skip the live trigger entirely; show a **pre-recorded screen capture** of the training panel completing a run, clearly labeled "recorded earlier for time," and keep the live button available for Q&A if a judge specifically asks to see it run.
- Whichever pattern, the backend logic is identical and real — you're not building a fake progress bar, you're choosing when to expose the real one.
- The report of "Test PR-AUC: 0.78" in this panel must pull directly from `artifacts/metrics/xgb_landslide_v1.0_metrics.json`'s `IMPORTANT_data_provenance_notice`-adjacent fields, and the panel should show a small info icon linking to that provenance note. Don't let this number appear in the UI without its caveat reachable — the acceptance checklist you already have flags exactly this risk.

---

## 8. Full folder structure (complete system, all members)

```
bhurakshak/
├── README.md
├── run_all.sh
├── requirements.txt
├── docker-compose.yml                 (NEW — optional, see Section 10)
│
├── physics/                            [Aritra — DONE]
│   ├── engine.py, infiltration.py, pore_pressure.py, factor_of_safety.py, schemas.py
│
├── ml/                                  [Aritra — DONE]
│   ├── dataset.py, train.py, split.py, labels.py, feature_manifest.py, explain.py, retrain.py
│
├── service/                             [Aritra — DONE]
│   ├── prediction_service.py, schemas.py
│
├── backend/                             [NEW — Aritra or whoever picks up backend wiring]
│   ├── main.py
│   ├── routes/ (predict.py, simulate.py, train.py, alerts.py, impact.py, locations.py)
│   ├── models/ (training_jobs.py, contacts_store.py)
│   ├── severity.py                       (NEW — Section 2.6, hazard magnitude heuristic)
│   ├── confidence.py                     (NEW — Section 2.5, assembled confidence score)
│   └── config.py
│
├── gis/                                  [Sanit — Impact Engine]
│   ├── impact_queries.sql               (existing stub)
│   ├── impact_engine.py                  (NEW — Python wrapper calling PostGIS, returns
│   │                                       affected villages/roads for a location_id)
│   └── seed_data/
│       ├── villages_demo.geojson         (6 pilot zones, expanded from original 2-3)
│       └── roads_demo.geojson
│
├── action/                                [Sanit — Action Engine]
│   └── action_engine.py                   (DONE — decision grid + authored citizen
│                                            messages, Section 4)
│
├── alerts/                                [NEW — Sanit, per Section 5 of this plan]
│   ├── distance_tiers.py
│   ├── language_templates.py               (NEW — Section 5.1, 4-language templates,
│   │                                         needs native-speaker review before real use)
│   ├── sms_sender.py
│   └── dispatch.py                        (orchestrates: prediction -> action check ->
│                                            classify_contacts -> send_sms per contact)
│
├── terrain3d/                              [NEW — Sayan, per Section 6]
│   ├── fetch_dem.py
│   ├── dem_to_heightmap.py
│   └── heightmaps/*.json
│
├── frontend/                                [Sayan + Soumodip]
│   ├── package.json
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── MapView.jsx                  (Leaflet 2D map, existing plan)
│   │   │   ├── ActionCard.jsx                (existing plan)
│   │   │   ├── SimulationConsole.jsx          (NEW — Section 3, per-site state)
│   │   │   ├── SitePanel.jsx                    (NEW — Section 3.2/6.2, shared by 2D+3D)
│   │   │   ├── ImpactLayer.jsx                  (NEW — Section 2.4)
│   │   │   ├── TrainingPanel.jsx              (NEW — Section 7)
│   │   │   ├── AlertsPanel.jsx                (NEW — Section 5.5)
│   │   │   ├── Terrain3D.jsx                  (NEW — Section 6.2/6.4)
│   │   │   ├── CitizenReportForm.jsx           (existing plan, Soumodip)
│   │   │   └── VerificationList.jsx            (existing plan, Soumodip)
│   │   ├── api/client.js                      (fetch wrappers for every /api/* route)
│   │   └── offline/                            (existing PWA plan, Sayan, Day 2)
│   └── public/manifest.json
│
├── demo/                                     [Aritra — DONE, extend as needed]
│   ├── pilot_locations.json
│   ├── sample_predictions/
│   └── demo_script.md                          (Aastha/Sagar's narrative, existing plan)
│
├── data/, artifacts/                          [Aritra — DONE]
├── tests/                                      [Aritra — DONE, add backend/frontend tests]
└── docs/
    ├── scaling_notes.md                        (existing)
    ├── acceptance_checklist.md                 (existing)
    └── implementation_plan.md                  (this document)
```

---

## 9. Integration sequence (who waits on whom)

This is the part your Work Distribution doc already got right ("lock the JSON contract before anyone generates integration code") — extending that discipline to the new pieces:

1. **Hour 0**: Everyone reads this plan and the existing JSON contract doc. No coding yet. Note that `action/action_engine.py`, `backend/severity.py`, and `backend/confidence.py` are already written and unit-tested — Sanit's job on the Action Engine is to wire it into `routes/impact.py`/the alert flow and tune the decision-grid thresholds during rehearsal if needed, not to write it from scratch.
2. **Hour 0–2**: Aritra wires `backend/main.py` + `routes/predict.py` + `routes/locations.py` — the minimum needed for anyone else to make an HTTP call. Announce the base URL (`http://localhost:8000/api`) the moment it's up. Wrap responses with the `confidence`/`severity` envelope from Section 2.5/2.6 from the start, so nobody builds against the bare contract JSON and has to retrofit the wrapper later.
3. **Parallel, once backend is live**:
   - Sayan: `MapView.jsx` + `ActionCard.jsx` reading `/api/predict`, exactly as originally planned, now also displaying `response.confidence` and `response.severity`.
   - Sanit: `gis/impact_engine.py`, then `routes/impact.py` to expose it; wire the existing `action/action_engine.py` into the alert trigger path.
   - Soumodip: `CitizenReportForm.jsx` (unblocked already, doesn't depend on any of this).
4. **Hour 2–4**: Aritra adds `routes/simulate.py`. Sayan builds `SimulationConsole.jsx` with the per-site state model (Section 3.3) against it immediately — this is your priority feature, don't let it slip to Day 2. Confirm all 6 `pilot_locations.json` entries score correctly through `/api/simulate` before moving on.
5. **Hour 4–6**: Sanit builds `alerts/` module (`distance_tiers.py`, `dispatch.py`, wiring the pre-built `language_templates.py`) + `routes/alerts.py`; Sayan builds `AlertsPanel.jsx` with the language dropdown from Section 5.5. Test with dry-run mode only until numbers are Twilio-verified. **Get the Hindi/Nepali/Bengali templates reviewed by a fluent speaker in this window** — don't leave it for Day 2 night.
6. **Day 2 morning**: `routes/train.py` + `TrainingPanel.jsx`. This is genuinely optional — cut first if behind schedule.
7. **Day 2, once map/Action Card stable**: Sayan runs `fetch_dem.py` ONCE for the single wide bounding box covering all 6 sites (Section 6.3 — not 6 separate fetches), then builds `Terrain3D.jsx` with the click-to-open-panel behavior (Section 6.2), sharing the `SitePanel` component with the 2D map. Also the originally-planned offline PWA layer — both are "add last" items, prioritize whichever demos better in your specific rehearsal.
8. **Day 2 afternoon**: Full run-throughs, exactly as your original plan specifies — minimum two, timed by Aastha. Explicitly rehearse the multi-site simulation moment (Section 3.4's "regional storm" preset) at least once — it's the most complex live interaction in the whole demo and the one most likely to need a second take.

---

## 10. Optional: containerization (skip if this adds risk, not saves time)

If your team is comfortable with Docker, a `docker-compose.yml` running the FastAPI backend + a static frontend build + (optionally) a PostGIS container removes "works on my machine" integration failures right before the demo. If nobody on the team has used Docker under time pressure before, skip this — a live demo failure from an unfamiliar tool is worse than one from familiar `npm start` / `uvicorn` commands everyone's already used all sprint.

```yaml
# docker-compose.yml (optional)
version: "3.8"
services:
  backend:
    build: .
    ports: ["8000:8000"]
    environment:
      - TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID}
      - TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN}
  postgis:
    image: postgis/postgis:16-3.4
    environment:
      - POSTGRES_PASSWORD=demo
    ports: ["5432:5432"]
```

---

## 11. What to say to judges (and what not to)

- ✅ "One trained model, loaded once, scores every monitored location — we demonstrated this scoring 100 simulated locations in under a second."
- ✅ "This slider panel lets us show you the system reacting to a scenario in real time, because we can't control live weather during a 10-minute demo slot — every number you see here is the real physics engine and real trained model responding to the input, not a canned animation."
- ✅ "This is a 3D hazard visualization built on real elevation data for our pilot sites, colored by our system's current output."
- ✅ "We separate *how likely* a landslide is from *how severe* it could be if it happens — combining stability margin, slope angle, slip depth, and rainfall intensity into a severity score, so a shallow marginal slope isn't treated the same as a deep, steep, severely unstable one."
- ✅ "We assemble a confidence score from data completeness, physics engine validity, and how decisively the model's probability sits away from the threshold — the system tells you not just what it thinks, but how much to trust that specific call."
- ✅ "Alert recipients choose their own preferred language when they register, rather than the system guessing from a phone number — that's both more reliable and more realistic for an actual deployment."
- ❌ Don't say "84% accurate" — say "physics-informed features nearly tripled our PR-AUC over an environmental-only baseline in generalization testing to unseen locations" and be ready to explain the synthetic-data caveat if asked.
- ❌ Don't call the 3D view a "digital twin" — that invites a question about Phase 3 of your own roadmap that you don't want to answer live.
- ❌ Don't claim the SMS system messages "the public" — say "for this demo, alerts go to our pre-registered team numbers; the distance-tiered logic is the same logic that would route to real registered residents in a deployed version."
- ❌ Don't say the severity score "predicts landslide size" — say it's "an engineered heuristic combining physically meaningful factors," and if pressed, say plainly that validating it against real landslide volumes is future work, not something this prototype claims.

---

## 12. Summary of what's genuinely new work vs. reuse

| Component | Status |
|---|---|
| Physics engine, XGBoost model, prediction service | **Already built and tested** (prior deliverable) |
| FastAPI backend wrapper | New, thin — mostly wiring |
| Simulation Console (now per-site, 6 sites) | New, moderate — your highest-value new feature |
| Severity heuristic (`backend/severity.py`) | New, small — built and unit-tested, honestly caveated |
| Confidence assembly (`backend/confidence.py`) | New, small — built and tested against a real sample prediction |
| Action Engine decision grid (`action/action_engine.py`) | New, small — built and tested, closes a gap left open in the original plan |
| Training Trigger UI | New, moderate — lowest priority, cut first if needed |
| Alert Dispatch + distance tiers + language selection | New, moderate — real geospatial logic + authored multi-language templates, not trivial |
| 3D terrain viewer with per-site click-to-open | New, moderate-to-high — highest visual payoff, also highest risk if unrehearsed |
| Dashboard 2D map, Action Card, PWA, citizen form | **Unchanged from original Work Distribution doc** |
| Impact Engine (map rendering added, computation unchanged) | **Computation unchanged**, map layer is new |
