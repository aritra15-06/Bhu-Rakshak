import { useState } from "react";
import { useSiteState } from "../state/SiteStateContext";
import { api } from "../api/client";

const SLIDERS = [
  { key: "rainfall_1h_mm", label: "Rainfall (1h)", min: 0, max: 40, step: 0.5, unit: "mm/h" },
  { key: "rainfall_24h_mm", label: "Rainfall (24h)", min: 0, max: 300, step: 2, unit: "mm" },
  { key: "initial_saturation_0_1", label: "Antecedent Saturation", min: 0, max: 1, step: 0.01, unit: "" },
  { key: "slope_deg", label: "Slope Angle", min: 10, max: 60, step: 1, unit: "°" },
];

export function SimulationPanel() {
  const {
    sites,
    applyOverrides,
    resetSite,
    runScenario,
    activeScenario,
    setToastAlert,
    batchSimulate,
  } = useSiteState();

  const [pendingBySite, setPendingBySite] = useState({});
  const [runningScenario, setRunningScenario] = useState(null);
  const [applyingSite, setApplyingSite] = useState(null);
  const [dispatchingSite, setDispatchingSite] = useState(null);

  const entries = Object.entries(sites);

  // Handle Scenario triggers
  async function handleTriggerScenario(scenarioId) {
    setRunningScenario(scenarioId);
    try {
      await runScenario(scenarioId);
    } finally {
      setRunningScenario(null);
    }
  }

  // Handle slider changes for an individual site in the grid
  function handleSlider(locId, key, value) {
    const val = parseFloat(value);
    setPendingBySite((prev) => ({
      ...prev,
      [locId]: {
        ...(prev[locId] || {}),
        [key]: val,
      },
    }));
  }

  function getSliderValue(locId, key, params) {
    const pending = pendingBySite[locId] || {};
    if (pending[key] !== undefined) return pending[key];
    if (params && params[key] !== undefined) return params[key];
    const defaults = { rainfall_1h_mm: 2.0, rainfall_24h_mm: 20.0 };
    return defaults[key] ?? 0;
  }

  // Apply single site overrides
  async function handleApplySite(locId) {
    const pending = pendingBySite[locId];
    if (!pending || Object.keys(pending).length === 0) return;
    setApplyingSite(locId);
    try {
      await applyOverrides(locId, pending);
      setPendingBySite((prev) => {
        const next = { ...prev };
        delete next[locId];
        return next;
      });
    } finally {
      setApplyingSite(null);
    }
  }

  // Reset single site
  async function handleResetSingle(locId) {
    setApplyingSite(locId);
    try {
      await resetSite(locId);
      setPendingBySite((prev) => {
        const next = { ...prev };
        delete next[locId];
        return next;
      });
    } finally {
      setApplyingSite(null);
    }
  }

  // Reset all 6 sites
  async function handleResetAll() {
    setRunningScenario("reset_all");
    try {
      await batchSimulate({}, true);
      setPendingBySite({});
      setToastAlert({
        type: "success",
        title: "All Stations Reset",
        message: "All six North Sikkim pilot monitoring stations have been reset to baseline parameters.",
        evac_towns: [],
        blocked_roads: [],
        detour_towns: [],
      });
    } finally {
      setRunningScenario(null);
    }
  }

  // Dispatch alert for single site
  async function handleDispatchAlert(locId, siteName) {
    setDispatchingSite(locId);
    try {
      const res = await api.sendAlerts(locId, true);
      const siteData = sites[locId];
      const spatial = siteData?.spatial_context || {};
      const road = spatial.primary_road_corridor || spatial.nearest_road?.name || siteName || "Mountain Highway";
      setToastAlert({
        type: res.action === "EVACUATE" ? "danger" : "warning",
        title: `🚨 Emergency Alert: ${siteName || locId}`,
        message: `Action: ${res.action} · Dispatched to ${res.recipients?.length || 0} registered citizens & observers along ${road}.`,
        evac_towns: res.recipients?.filter((r) => r.tier === "EVACUATE_NOW").map((r) => r.town) || [],
        blocked_roads: [road],
        detour_towns: res.recipients?.filter((r) => r.tier.includes("DETOUR")).map((r) => r.town) || [],
      });
    } finally {
      setDispatchingSite(null);
    }
  }

  // Summary counts
  let unstableCount = 0;
  let marginalCount = 0;
  let stableCount = 0;
  let blockedRoads = [];

  entries.forEach(([locId, d]) => {
    const st = d?.prediction?.physics_output?.stability_state;
    const fos = d?.prediction?.physics_output?.factor_of_safety;
    const spatial = d?.spatial_context || {};
    const roadName = spatial.nearest_road?.name || spatial.primary_road_corridor || d?.current_params?.name || locId;
    if (st === "UNSTABLE" || (fos != null && fos < 1.0)) {
      unstableCount++;
      blockedRoads.push(roadName);
    } else if (st === "MARGINAL" || (fos != null && fos < 1.3)) {
      marginalCount++;
    } else {
      stableCount++;
    }
  });

  return (
    <div className="simulation-page-container">
      {/* Simulation Header & Scenario Control Hub */}
      <div className="sim-page-header">
        <div className="sim-page-title-row">
          <div>
            <h2 style={{ margin: 0, fontSize: 19 }}>⚡ Multi-Site Real-Time Simulation Engine</h2>
            <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "var(--ink-muted)" }}>
              Simulates concurrent meteorological &amp; geotechnical conditions across all 6 North Sikkim zones,
              calculating physics limit-equilibrium stability and calibrated ML landslide probabilities simultaneously.
            </p>
          </div>

          <div className="sim-scenario-actions">
            <button
              className={`sim-action-btn danger ${activeScenario === "cloudburst_crisis" ? "active" : ""}`}
              disabled={runningScenario !== null}
              onClick={() => handleTriggerScenario("cloudburst_crisis")}
            >
              ⚡ North Sikkim Cloudburst Crisis
            </button>
            <button
              className={`sim-action-btn warning ${activeScenario === "monsoon_surge" ? "active" : ""}`}
              disabled={runningScenario !== null}
              onClick={() => handleTriggerScenario("monsoon_surge")}
            >
              🌧️ Widespread Monsoon Surge
            </button>
            <button
              className={`sim-action-btn success ${activeScenario === "dry_baseline" ? "active" : ""}`}
              disabled={runningScenario !== null}
              onClick={() => handleTriggerScenario("dry_baseline")}
            >
              ☀️ Post-Monsoon Dry Baseline
            </button>
            <button
              className="sim-action-btn secondary"
              disabled={runningScenario !== null}
              onClick={handleResetAll}
            >
              🔄 Reset All Stations
            </button>
          </div>
        </div>

        {/* Real-Time Telemetry KPI Row */}
        <div className="sim-kpi-grid">
          <div className="sim-kpi-card">
            <span className="sim-kpi-val">{entries.length}</span>
            <span className="sim-kpi-lbl">Stations Monitored</span>
          </div>
          <div className="sim-kpi-card danger">
            <span className="sim-kpi-val" style={{ color: "#dc2626" }}>{unstableCount}</span>
            <span className="sim-kpi-lbl">Critical / Unstable</span>
          </div>
          <div className="sim-kpi-card warning">
            <span className="sim-kpi-val" style={{ color: "#d97706" }}>{marginalCount}</span>
            <span className="sim-kpi-lbl">Marginal Warnings</span>
          </div>
          <div className="sim-kpi-card success">
            <span className="sim-kpi-val" style={{ color: "#16a34a" }}>{stableCount}</span>
            <span className="sim-kpi-lbl">Stable Slopes</span>
          </div>
          <div className="sim-kpi-card">
            <span className="sim-kpi-val" style={{ color: blockedRoads.length > 0 ? "#dc2626" : "#475569" }}>
              {blockedRoads.length}
            </span>
            <span className="sim-kpi-lbl">Blocked Highway Corridors</span>
          </div>
        </div>
      </div>

      {/* 6-Site Grid Layout */}
      <div className="sim-cards-grid">
        {entries.map(([locId, data]) => {
          const params = data?.current_params || {};
          const prediction = data?.prediction || {};
          const physics = prediction?.physics_output || {};
          const ml = prediction?.ml_output || {};
          const confidence = data?.confidence || {};
          const severity = data?.severity || {};
          const fos = physics.factor_of_safety;
          const probPercent = ml.calibrated_probability != null ? (ml.calibrated_probability * 100).toFixed(1) : "—";
          const probNum = ml.calibrated_probability != null ? ml.calibrated_probability * 100 : 0;
          const spatial = data?.spatial_context || {};
          const nearestRoad = spatial.nearest_road;
          const nearestTown = spatial.nearest_town;
          const road = spatial.primary_road_corridor || nearestRoad?.name || params.name || "Mountain Highway";
          const pending = pendingBySite[locId] || {};
          const isApplying = applyingSite === locId;
          const isDispatching = dispatchingSite === locId;

          // Severity Styling
          let sevClass = "severity-minor";
          let badgeText = "🟢 Low Hazard";
          let headline = "Stable Slope Equilibrium";
          let headlineSub = "Forces in balance. No severe movement expected.";

          if (severity.severity_band === "CATASTROPHIC_POTENTIAL" || (fos != null && fos < 0.9 && probNum > 75)) {
            sevClass = "severity-critical";
            badgeText = "🚨 Critical Danger";
            headline = "VERY DANGEROUS LANDSLIDE IMMINENT";
            headlineSub = "Major deep-seated failure & total corridor severance.";
          } else if (severity.severity_band === "MAJOR" || (fos != null && fos < 1.0)) {
            sevClass = "severity-major";
            badgeText = "🟠 Major Warning";
            headline = "Major Dangerous Landslide Expected";
            headlineSub = "High-volume slope failure with heavy debris runout.";
          } else if (severity.severity_band === "MODERATE" || (fos != null && fos < 1.3)) {
            sevClass = "severity-moderate";
            badgeText = "🟡 Moderate Warning";
            headline = "Small / Localized Landslide Likely";
            headlineSub = "Embankment slump & shoulder wash expected.";
          }

          const stabilityLower = (physics.stability_state || "unknown").toLowerCase();

          return (
            <div key={locId} className={`sim-station-card ${sevClass}`}>
              {/* Card Top Header */}
              <div className="sim-card-header">
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong style={{ fontSize: 14 }}>{locId}</strong>
                    <span className="sim-card-station-name">{params.name}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-muted)", marginTop: 2 }}>
                    <span>🛣️ {nearestRoad?.name || road}</span>
                    {nearestTown && <span> · 🏘️ {nearestTown.name} ({nearestTown.distance_km}km)</span>}
                    <span> · Elev. {params.elevation_m}m</span>
                  </div>
                </div>

                <span className={`sim-card-badge ${sevClass}`}>{badgeText}</span>
              </div>

              {/* Highlighted Prediction Window (Color changes with severity) */}
              <div className={`prediction-window ${sevClass}`} style={{ margin: "10px 0" }}>
                <div className="pred-window-header">
                  <span style={{ fontWeight: 700, fontSize: 12 }}>{headline}</span>
                  <span className="pred-site-tag">{physics.stability_state || "STABLE"}</span>
                </div>
                <p style={{ margin: "2px 0 8px 0", fontSize: 11, opacity: 0.9 }}>{headlineSub}</p>

                <div className="pred-metrics-grid" style={{ marginBottom: 0 }}>
                  <div className="pred-metric-card">
                    <span className="pred-card-label">Factor of Safety</span>
                    <span className="pred-prob-val" style={{ fontSize: 15 }}>
                      {fos != null ? fos.toFixed(2) : "—"}
                    </span>
                    <span className="pred-card-sub">State: {physics.stability_state}</span>
                  </div>

                  <div className="pred-metric-card">
                    <span className="pred-card-label">Landslide Probability</span>
                    <span className="pred-prob-val" style={{ fontSize: 15 }}>{probPercent}%</span>
                    <div className="pred-prob-track">
                      <div className="pred-prob-fill" style={{ width: `${Math.min(100, Math.max(2, probNum))}%` }} />
                    </div>
                  </div>

                  <div className="pred-metric-card">
                    <span className="pred-card-label">Severity Band</span>
                    <span className="pred-severity-val" style={{ fontSize: 12 }}>
                      {severity.severity_band || "MINOR"}
                    </span>
                    <span className="pred-card-sub">Score: {severity.severity_score_0_100 ?? 0}/100</span>
                  </div>

                  <div className="pred-metric-card">
                    <span className="pred-card-label">Confidence</span>
                    <span className="pred-conf-pill moderate" style={{ fontSize: 11 }}>
                      {confidence.confidence_band || "MODERATE"}
                    </span>
                    <span className="pred-card-sub">Checks verified</span>
                  </div>
                </div>
              </div>

              {/* Parameter Sliders for this Location */}
              <div className="sim-card-sliders">
                {SLIDERS.map((s) => (
                  <div key={s.key} className="sim-slider-row">
                    <div className="slider-label" style={{ fontSize: 11, marginBottom: 2 }}>
                      <span>{s.label}</span>
                      <span className="value">
                        {getSliderValue(locId, s.key, params)?.toFixed?.(s.step < 1 ? 2 : 1) ??
                          getSliderValue(locId, s.key, params)}{" "}
                        {s.unit}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      value={getSliderValue(locId, s.key, params) ?? s.min}
                      onChange={(e) => handleSlider(locId, s.key, e.target.value)}
                    />
                  </div>
                ))}
              </div>

              {/* Card Actions */}
              <div className="sim-card-actions">
                <button
                  className="btn btn-primary"
                  disabled={isApplying || Object.keys(pending).length === 0}
                  onClick={() => handleApplySite(locId)}
                  style={{ fontSize: 11.5, padding: "5px 10px" }}
                >
                  {isApplying ? "Calculating…" : "Apply & Predict"}
                </button>

                <button
                  className="btn"
                  disabled={isApplying}
                  onClick={() => handleResetSingle(locId)}
                  style={{ fontSize: 11.5, padding: "5px 10px" }}
                >
                  Reset
                </button>

                <button
                  className="btn"
                  disabled={isDispatching}
                  onClick={() => handleDispatchAlert(locId, params.name)}
                  style={{
                    fontSize: 11.5,
                    padding: "5px 10px",
                    marginLeft: "auto",
                    background: "rgba(220, 38, 38, 0.08)",
                    color: "#b91c1c",
                    borderColor: "#fca5a5",
                    fontWeight: 600,
                  }}
                >
                  {isDispatching ? "Dispatching…" : "🚨 Send Alert"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
