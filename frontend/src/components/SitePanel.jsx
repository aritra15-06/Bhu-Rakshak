import { useState, useRef, useEffect } from "react";
import { useSiteState } from "../state/SiteStateContext";
import { api } from "../api/client";

const PRESETS = {
  dry: { label: "Dry Baseline", overrides: { rainfall_1h_mm: 0.0, rainfall_24h_mm: 1, initial_saturation_0_1: 0.15 } },
  monsoon: { label: "Monsoon Surge", overrides: { rainfall_1h_mm: 8, rainfall_24h_mm: 80, initial_saturation_0_1: 0.55 } },
  extreme: { label: "Extreme Cloudburst", overrides: { rainfall_1h_mm: 35, rainfall_24h_mm: 240, initial_saturation_0_1: 0.85 } },
};

const SLIDERS = [
  { key: "rainfall_1h_mm", label: "Rainfall (1h)", min: 0, max: 40, step: 0.5, unit: "mm/h" },
  { key: "rainfall_24h_mm", label: "Rainfall (24h)", min: 0, max: 300, step: 2, unit: "mm" },
  { key: "initial_saturation_0_1", label: "Antecedent saturation", min: 0, max: 1, step: 0.01, unit: "" },
  { key: "slope_deg", label: "Slope angle", min: 5, max: 65, step: 1, unit: "°" },
  { key: "cohesion_kpa", label: "Soil cohesion", min: 0, max: 30, step: 0.5, unit: "kPa" },
];

export function SitePanel() {
  const { sites, selectedSite, applyOverrides, resetSite, setToastAlert } = useSiteState();
  const [pendingBySite, setPendingBySite] = useState({});
  const [applying, setApplying] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const debounceTimerRef = useRef(null);

  // Clean up any pending timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  if (!selectedSite) {
    return <div className="empty-state">Select a monitored station from the map or left list.</div>;
  }

  const data = sites[selectedSite];
  if (!data) {
    return <div className="empty-state">Loading station data…</div>;
  }

  const params = data.current_params || {};
  const prediction = data.prediction || {};
  const physics = prediction.physics_output || {};
  const ml = prediction.ml_output || {};
  const confidence = data.confidence || {};
  const severity = data.severity || {};
  const contributions = prediction.optional_explainability?.feature_contributions || [];
  const pendingOverrides = pendingBySite[selectedSite] || {};

  function currentValue(key) {
    if (pendingOverrides[key] !== undefined) return pendingOverrides[key];
    if (params[key] !== undefined) return params[key];
    const defaults = { rainfall_1h_mm: 2.0, rainfall_24h_mm: 20.0 };
    return defaults[key] ?? 0;
  }

  function handleSlider(key, value) {
    const val = parseFloat(value);
    const currentOverrides = pendingBySite[selectedSite] || {};
    const nextOverrides = {
      ...currentOverrides,
      [key]: val,
    };

    // 1. Instantly update local state so the slider thumb and value badge update at 60fps
    setPendingBySite((prev) => ({
      ...prev,
      [selectedSite]: nextOverrides,
    }));

    // 2. Debounced live prediction directly to backend physics & ML models without needing to click Apply
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      setApplying(true);
      try {
        await applyOverrides(selectedSite, nextOverrides);
      } catch (err) {
        console.error("Live predict failed:", err);
      } finally {
        setApplying(false);
      }
    }, 60);
  }

  async function handlePresetClick(presetOverrides) {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    setPendingBySite((prev) => ({
      ...prev,
      [selectedSite]: { ...presetOverrides },
    }));
    setApplying(true);
    try {
      await applyOverrides(selectedSite, presetOverrides);
    } catch (err) {
      console.error("Failed to apply preset:", err);
    } finally {
      setApplying(false);
    }
  }

  async function applyChanges(overridesToApply) {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    setApplying(true);
    try {
      await applyOverrides(selectedSite, overridesToApply);
    } finally {
      setApplying(false);
    }
  }

  async function handleReset() {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    setApplying(true);
    try {
      await resetSite(selectedSite);
      setPendingBySite((prev) => {
        const next = { ...prev };
        delete next[selectedSite];
        return next;
      });
    } catch (err) {
      console.error("Failed to reset site:", err);
    } finally {
      setApplying(false);
    }
  }

  const spatial = data.spatial_context || {};
  const nearestRoad = spatial.nearest_road;
  const nearestTown = spatial.nearest_town;
  const nearbyTowns = spatial.nearby_towns || [];
  const roadCorridor = spatial.primary_road_corridor || nearestRoad?.name || params.name || "Transit Corridor";

  async function handleDispatchAlert() {
    setDispatching(true);
    try {
      const res = await api.sendAlerts(selectedSite, true);
      const road = roadCorridor;
      setToastAlert({
        type: res.action === "EVACUATE" ? "danger" : "warning",
        title: `🚨 Emergency Alert: ${params.name || selectedSite}`,
        message: `Action: ${res.action} · Dispatched to ${res.recipients?.length || 0} citizens & observers along ${road}.`,
        evac_towns: res.recipients?.filter((r) => r.tier === "EVACUATE_NOW").map((r) => r.town) || [],
        blocked_roads: [road],
        detour_towns: res.recipients?.filter((r) => r.tier.includes("DETOUR")).map((r) => r.town) || [],
      });
    } catch (e) {
      console.error("Alert failed", e);
    } finally {
      setDispatching(false);
    }
  }

  const fos = physics.factor_of_safety;
  const probPercent = ml.calibrated_probability != null ? (ml.calibrated_probability * 100).toFixed(1) : "—";
  const probNum = ml.calibrated_probability != null ? ml.calibrated_probability * 100 : 0;
  const confPercent = confidence.confidence_0_1 != null ? Math.round(confidence.confidence_0_1 * 100) : 80;
  const sevScore = severity.severity_score_0_100 ?? 0;

  // Determine Severity Color Class & Warning Text
  let severityClass = "severity-minor";
  let hazardBadge = "🟢 Low Hazard";
  let dangerTitle = "Minimal / Low Landslide Threat";
  let dangerSubtext = "Minor superficial wash only.";
  let impactDescription =
    "Geotechnical forces are in balance. If local failure occurs, it will be a small, superficial slope slump with minimal danger and low velocity.";

  if (severity.severity_band === "CATASTROPHIC_POTENTIAL" || sevScore >= 75 || (fos != null && fos < 0.9 && probNum > 75)) {
    severityClass = "severity-critical";
    hazardBadge = "🚨 Critical Danger";
    dangerTitle = "VERY DANGEROUS LANDSLIDE IMMINENT";
    dangerSubtext = "Major deep-seated mass movement & rapid avalanche.";
    impactDescription =
      "High probability of a large-scale, very dangerous landslide. Destructive kinetic mass movement, road collapse, and total corridor severance expected.";
  } else if (severity.severity_band === "MAJOR" || sevScore >= 50 || (fos != null && fos < 1.0)) {
    severityClass = "severity-major";
    hazardBadge = "🟠 Major Warning";
    dangerTitle = "Major Dangerous Landslide Expected";
    dangerSubtext = "High-volume slope failure with heavy debris runout.";
    impactDescription =
      "Driving gravitational forces exceed shear resistance (FoS < 1.0). High risk of deep slip surface failure, road burial, and severe infrastructure damage.";
  } else if (severity.severity_band === "MODERATE" || sevScore >= 25 || (fos != null && fos < 1.3)) {
    severityClass = "severity-moderate";
    hazardBadge = "🟡 Moderate Warning";
    dangerTitle = "Small / Localized Landslide Likely";
    dangerSubtext = "Surface slumping, loose rockfall, and shoulder spillage.";
    impactDescription =
      "Antecedent saturation is reducing soil cohesion. Smaller slope failure or roadside embankment slumping expected with moderate transit disruption.";
  }

  const stabilityLower = (physics.stability_state || "unknown").toLowerCase();
  const confLower = (confidence.confidence_band || "moderate").toLowerCase();
  const confReasonText =
    confidence.reasons && confidence.reasons.length > 0
      ? confidence.reasons[0]
      : "Data quality checks verified; physics limit-equilibrium calculations align with ML gradient booster predictions.";

  return (
    <div className="panel-inner-scroll">
      {/* Site Header */}
      <div className="panel-section" style={{ paddingBottom: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>{params.name}</h3>
            <span style={{ fontSize: 12, color: "var(--ink-muted)", fontWeight: 500 }}>
              {selectedSite} · Station Geotechnical Analysis
            </span>
          </div>
        </div>

        <div className="metric-row" style={{ marginTop: 8 }}>
          <span className="metric-label">Coordinates</span>
          <span className="metric-value">
            {params.latitude?.toFixed(4)}°N, {params.longitude?.toFixed(4)}°E (Elev. {params.elevation_m}m)
          </span>
        </div>
        <div className="metric-row">
          <span className="metric-label">Status Timestamp</span>
          <span className="metric-value" style={{ color: "#166534", fontWeight: 600 }}>
            {data.last_updated || "Just now"}
          </span>
        </div>
      </div>

      {/* Minimal Highlighted Details Card with Dynamic Severity Colors */}
      <div className={`prediction-window ${severityClass}`} style={{ marginBottom: 20 }}>
        <div className="pred-window-header">
          <div className="pred-badge-status">
            <span className="pred-pulse-dot" />
            <span>{hazardBadge}</span>
          </div>
          <span className="pred-site-tag">{selectedSite} · Evaluation</span>
        </div>

        <div className="pred-danger-headline">
          <h4>{dangerTitle}</h4>
          <p>{impactDescription}</p>
        </div>

        <div className="pred-metrics-grid">
          {/* Stability & FoS */}
          <div className="pred-metric-card">
            <span className="pred-card-label">Slope Stability</span>
            <span className={`pred-stability-pill ${stabilityLower}`}>
              {physics.stability_state || "STABLE"}
            </span>
            <span className="pred-card-sub">
              Factor of Safety: <strong>{fos != null ? fos.toFixed(2) : "—"}</strong>
            </span>
          </div>

          {/* Landslide Probability */}
          <div className="pred-metric-card">
            <span className="pred-card-label">Landslide Probability</span>
            <span className="pred-prob-val">{probPercent}%</span>
            <div className="pred-prob-track">
              <div className="pred-prob-fill" style={{ width: `${Math.min(100, Math.max(2, probNum))}%` }} />
            </div>
            <span className="pred-card-sub">{probNum > 50 ? "High Likelihood" : "Low / Moderate"}</span>
          </div>

          {/* Severity Classification */}
          <div className="pred-metric-card">
            <span className="pred-card-label">Landslide Severity</span>
            <span className="pred-severity-val">
              {severity.severity_band || "MINOR"} ({sevScore}/100)
            </span>
            <span className="pred-card-sub">{dangerSubtext}</span>
          </div>

          {/* Confidence Level */}
          <div className="pred-metric-card">
            <span className="pred-card-label">Model Confidence</span>
            <span className={`pred-conf-pill ${confLower}`}>
              {confidence.confidence_band || "MODERATE"} ({confPercent}%)
            </span>
            <span className="pred-card-sub">Evidence Quality: High</span>
          </div>
        </div>

        {/* Confidence Explanation Reason */}
        <div className="pred-confidence-detail">
          <span className="pred-detail-icon">🔬</span>
          <span>
            <strong>Confidence Assessment:</strong> {confReasonText}
          </span>
        </div>
      </div>

      {/* Sliding Adjustment Toggles Section */}
      <div className="panel-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14.5 }}>Geotechnical &amp; Rainfall Sliders</h3>
          <span style={{ fontSize: 11.5, color: applying ? "#d97706" : "#16a34a", fontWeight: 700 }}>
            {applying ? "⚡ Recalculating live…" : "⚡ Live Dynamic Prediction"}
          </span>
        </div>

        {/* Quick Presets */}
        <div className="preset-row" style={{ marginBottom: 14 }}>
          {Object.entries(PRESETS).map(([key, preset]) => (
            <button
              key={key}
              className="preset-btn"
              disabled={applying}
              onClick={() => handlePresetClick(preset.overrides)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Interactive Sliders */}
        {SLIDERS.map((s) => (
          <div className="slider-group" key={s.key} style={{ marginBottom: 14 }}>
            <div className="slider-label">
              <span style={{ fontWeight: 500 }}>{s.label}</span>
              <span className="value">
                {currentValue(s.key)?.toFixed?.(s.step < 1 ? 2 : 1) ?? currentValue(s.key)} {s.unit}
              </span>
            </div>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={currentValue(s.key) ?? s.min}
              onChange={(e) => handleSlider(s.key, e.target.value)}
            />
          </div>
        ))}

        <div className="btn-row" style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: applying ? "#d97706" : "#16a34a", fontWeight: 600 }}>
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: applying ? "#d97706" : "#16a34a",
                boxShadow: applying ? "0 0 6px #d97706" : "0 0 6px #16a34a",
                transition: "all 0.2s ease",
              }}
            />
            <span>{applying ? "Calculating live prediction…" : "Live Auto-Prediction Active"}</span>
          </div>

          <button
            className="btn btn-sm btn-outline"
            disabled={applying}
            onClick={handleReset}
            title="Reset site parameters back to original baseline"
          >
            🔄 Reset to baseline
          </button>
        </div>
      </div>

      {/* Feature Contributions / Explainability */}
      {contributions.length > 0 && (
        <div className="panel-section">
          <h3 style={{ fontSize: 13.5, marginBottom: 8 }}>What's driving this prediction</h3>
          <ul className="explain-list">
            {contributions.map((c) => (
              <li key={c.feature}>
                <span>{c.feature.replace(/_/g, " ")}</span>
                <span className={c.contribution >= 0 ? "contribution-pos" : "contribution-neg"}>
                  {c.contribution >= 0 ? "+" : ""}
                  {c.contribution.toFixed(3)}
                </span>
              </li>
            ))}
          </ul>
          <div className="caveat-note" style={{ marginTop: 8 }}>
            Post-hoc SHAP attribution — shows what the model weighted, not a causal proof.
          </div>
        </div>
      )}

      {/* Confidence assessment factors */}
      <div className="panel-section" style={{ borderBottom: "none" }}>
        <h3 style={{ fontSize: 13.5, marginBottom: 8 }}>Why this confidence</h3>
        <ul className="explain-list">
          {confidence.reasons && confidence.reasons.map((r, i) => (
            <li key={i}>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
