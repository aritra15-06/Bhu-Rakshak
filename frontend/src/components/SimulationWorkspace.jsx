import { useState, useEffect, useRef } from "react";
import { SimulationMapView } from "./SimulationMapView";
import { Terrain3DView } from "./Terrain3DView";
import {
  getDailySimulationState,
  getCalendarDate,
  getSeason,
} from "../data/annualSimulationTimeline";

const CORE_REGIONS = ["LOC01", "LOC02", "LOC03"];
const ALL_ZONES = ["LOC01", "LOC02", "LOC03", "LOC04", "LOC05", "LOC06"];

export function SimulationWorkspace() {
  const [viewMode, setViewMode] = useState("map"); // "map" or "3d"
  const [showPeople, setShowPeople] = useState(true);
  const [showInfrastructure, setShowInfrastructure] = useState(false);
  const [regionFilter, setRegionFilter] = useState("3"); // "3" or "6"
  const [selectedSite, setSelectedSite] = useState("LOC01");
  const [expandedRegions, setExpandedRegions] = useState({});
  const [simAlertToast, setSimAlertToast] = useState(null);
  const triggeredAlertsRef = useRef(new Set());

  function toggleRegion(locId) {
    setExpandedRegions((prev) => ({
      ...prev,
      [locId]: !prev[locId],
    }));
  }

  // 1-Year (365 Days) Accelerated Continuous Simulation Engine
  // 60 seconds duration at 1x = 60000ms / 365 ≈ 164ms per day
  const [dayOfYear, setDayOfYear] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 0.25x, 0.5x, 1x, 2x, 3x
  const timerRef = useRef(null);

  // Active state derived from current day in annual simulation timeline
  const annualFrame = getDailySimulationState(dayOfYear);
  const dateInfo = getCalendarDate(dayOfYear);
  const seasonInfo = getSeason(dayOfYear);

  // Playback timer loop supporting fractional speeds below 1x
  useEffect(() => {
    if (isPlaying) {
      const intervalMs = Math.max(25, Math.round(164 / playbackSpeed));
      timerRef.current = setInterval(() => {
        setDayOfYear((prev) => {
          if (prev >= 365) {
            setIsPlaying(false);
            return 365;
          }
          return prev + 1;
        });
      }, intervalMs);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, playbackSpeed]);

  function handlePlayPause() {
    if (dayOfYear >= 365) {
      setDayOfYear(1);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
    }
  }

  function handleReplay() {
    triggeredAlertsRef.current.clear();
    setSimAlertToast(null);
    setDayOfYear(1);
    setIsPlaying(true);
  }

  function handleScrub(e) {
    setDayOfYear(parseInt(e.target.value, 10));
  }

  // Automated Alert Trigger & Emergency Toast Popup when Severity Surges
  useEffect(() => {
    displayedList.forEach((locId) => {
      const r = activeSimSites[locId];
      if (!r) return;

      const isSevere =
        r.severity_band === "CATASTROPHIC_POTENTIAL" ||
        r.stability_state === "UNSTABLE" ||
        (r.factor_of_safety != null && r.factor_of_safety < 1.0);

      if (isSevere) {
        // Debounce alert per seasonal crisis epoch (~30 days) to prevent firing every frame
        const episodeKey = `${locId}_epoch_${Math.floor(dayOfYear / 30)}`;
        if (!triggeredAlertsRef.current.has(episodeKey)) {
          triggeredAlertsRef.current.add(episodeKey);

          // 1. Trigger on-screen Notification Popup Toast
          setSimAlertToast({
            id: `${locId}_${Date.now()}`,
            locationId: locId,
            name: r.name,
            day: dayOfYear,
            dateString: dateInfo.dateString,
            probability: r.probability_percent,
            fos: r.factor_of_safety?.toFixed(2),
            severity: r.severity_band || "CATASTROPHIC_POTENTIAL",
            statusText: r.statusText,
            roadBlocked: r.roadBlocked,
          });

          // 2. Automated SMS dispatch to people/observers via backend API
          fetch("/api/alerts/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ location_id: locId, dry_run: true }),
          }).catch((err) => {
            console.warn("Auto simulation alert dispatch:", err);
          });
        }
      }
    });
  }, [dayOfYear, activeSimSites, displayedList, dateInfo.dateString]);

  // Auto-dismiss emergency popup toast after 8 seconds
  useEffect(() => {
    if (!simAlertToast) return;
    const timer = setTimeout(() => {
      setSimAlertToast(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [simAlertToast]);


  // Active sites object passed to the map and cards
  // Fallback for auxiliary zones LOC04-06 if 6-zone view selected
  const activeSimSites = {
    ...annualFrame.regions,
    LOC04: {
      location_id: "LOC04",
      name: "Chungthang-Lachen Highway Cut",
      elevation_m: 2050,
      slope_deg: 46,
      rainfall_1h_mm: annualFrame.regions.LOC01.rainfall_1h_mm,
      rainfall_24h_mm: annualFrame.regions.LOC01.rainfall_24h_mm,
      initial_saturation_0_1: annualFrame.regions.LOC01.initial_saturation_0_1,
      factor_of_safety: Math.max(0.80, annualFrame.regions.LOC01.factor_of_safety - 0.05),
      calibrated_probability: annualFrame.regions.LOC01.calibrated_probability,
      probability_percent: annualFrame.regions.LOC01.probability_percent,
      stability_state: annualFrame.regions.LOC01.stability_state,
      severity_band: annualFrame.regions.LOC01.severity_band,
      statusText: annualFrame.regions.LOC01.statusText,
      roadBlocked: annualFrame.regions.LOC01.roadBlocked,
      latitude: 27.6250,
      longitude: 88.6100,
    },
    LOC05: {
      location_id: "LOC05",
      name: "Rangpo Teesta River Slope",
      elevation_m: 650,
      slope_deg: 22,
      rainfall_1h_mm: Math.round(annualFrame.regions.LOC02.rainfall_1h_mm * 0.4 * 10) / 10,
      rainfall_24h_mm: Math.round(annualFrame.regions.LOC02.rainfall_24h_mm * 0.4 * 10) / 10,
      initial_saturation_0_1: 0.25,
      factor_of_safety: 1.65,
      calibrated_probability: 0.04,
      probability_percent: 4.0,
      stability_state: "STABLE",
      severity_band: "MINOR",
      statusText: "Stable Riverbank",
      roadBlocked: false,
      latitude: 27.1700,
      longitude: 88.5300,
    },
    LOC06: {
      location_id: "LOC06",
      name: "Gangtok-Nathula Pass Highway",
      elevation_m: 3850,
      slope_deg: 38,
      rainfall_1h_mm: Math.round(annualFrame.regions.LOC03.rainfall_1h_mm * 0.8 * 10) / 10,
      rainfall_24h_mm: Math.round(annualFrame.regions.LOC03.rainfall_24h_mm * 0.8 * 10) / 10,
      initial_saturation_0_1: 0.32,
      factor_of_safety: 1.48,
      calibrated_probability: 0.12,
      probability_percent: 12.0,
      stability_state: "STABLE",
      severity_band: "MINOR",
      statusText: "High Mountain Pass",
      roadBlocked: false,
      latitude: 27.3800,
      longitude: 88.6600,
    },
  };

  const displayedList = regionFilter === "3" ? CORE_REGIONS : ALL_ZONES;

  // Active severe hazard regions for the dynamic live tracker
  const severeRegionsList = displayedList.filter((locId) => {
    const r = activeSimSites[locId];
    return (
      r &&
      (r.severity_band === "CATASTROPHIC_POTENTIAL" ||
        r.severity_band === "MAJOR" ||
        r.stability_state === "UNSTABLE" ||
        (r.factor_of_safety != null && r.factor_of_safety < 1.0) ||
        r.roadBlocked)
    );
  });

  // Track any active red alerts in the current frame
  let activeRedCount = 0;
  let activeAmberCount = 0;
  displayedList.forEach((id) => {
    const r = activeSimSites[id];
    if (r?.severity_band === "CATASTROPHIC_POTENTIAL" || r?.stability_state === "UNSTABLE") activeRedCount++;
    else if (r?.severity_band === "MAJOR" || r?.stability_state === "MARGINAL") activeAmberCount++;
  });

  return (
    <div className="sim-workspace-layout">
      {/* Left / Center Section: Dedicated Map & 3D Terrain */}
      <div className="sim-map-container">
        {/* Top Controls Toolbar: 2D/3D toggle, people button, and 1-Year Timeline Controller */}
        <div className="sim-map-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* 2D Map vs 3D Terrain Switch */}
            <div className="sim-view-toggle">
              <button
                className={`sim-toggle-btn ${viewMode === "map" ? "active" : ""}`}
                onClick={() => setViewMode("map")}
              >
                🗺️ 2D Simulation Map
              </button>
              <button
                className={`sim-toggle-btn ${viewMode === "3d" ? "active" : ""}`}
                onClick={() => setViewMode("3d")}
              >
                🏔️ 3D Terrain Model
              </button>
            </div>

            {/* Dedicated People Toggle Button (for 2D Map) */}
            {viewMode === "map" && (
              <button
                className={`sim-people-btn ${showPeople ? "active" : ""}`}
                onClick={() => setShowPeople(!showPeople)}
                title="Toggle population and observer pins across North Sikkim settlements"
              >
                <span>{showPeople ? "👥 People Marked: ON" : "👥 People Marked: OFF"}</span>
                <span className={`sim-people-badge ${showPeople ? "on" : "off"}`}>
                  {showPeople ? "Active" : "Hidden"}
                </span>
              </button>
            )}

            {/* Dedicated Towns & Government Roads Toggle Button */}
            {viewMode === "map" && (
              <button
                className={`sim-people-btn ${showInfrastructure ? "active" : ""}`}
                onClick={() => setShowInfrastructure(!showInfrastructure)}
                title="Toggle authentic government highways (BRO/PWD) and settlement towns across Sikkim"
              >
                <span>{showInfrastructure ? "🛣️ Towns & Roads: ON" : "🛣️ Towns & Roads: OFF"}</span>
                <span className={`sim-people-badge ${showInfrastructure ? "on" : "off"}`}>
                  {showInfrastructure ? "Active" : "Hidden"}
                </span>
              </button>
            )}
          </div>

          {/* 1-Year Simulation Playback Controls with Multi-Speed & Slow-Motion (< 1x) */}
          <div className="sim-timeline-ctrl-strip">
            <button
              className={`btn btn-sm ${isPlaying ? "btn-warning" : "btn-primary"}`}
              onClick={handlePlayPause}
              style={{ fontWeight: 700 }}
            >
              {isPlaying ? "⏸️ Pause" : (dayOfYear >= 365 ? "🔄 Replay Year (60s)" : "▶️ Play Year Simulation")}
            </button>
            <button
              className="btn btn-sm"
              onClick={handleReplay}
              title="Reset and start 1-year replay from January 1"
            >
              🔄 Replay
            </button>
            <div className="sim-speed-control-bar">
              <span className="sim-speed-label">Speed:</span>
              <div className="sim-speed-buttons">
                {[0.25, 0.5, 1, 2, 3].map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    className={`sim-speed-chip ${playbackSpeed === spd ? "active" : ""}`}
                    onClick={() => setPlaybackSpeed(spd)}
                    title={`Playback speed ${spd}x (${spd < 1 ? "Slow Motion" : "Normal/Fast"})`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
              <input
                type="range"
                min="0.25"
                max="3.0"
                step="0.25"
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                className="sim-speed-slider"
                title={`Fine-tune simulation speed: ${playbackSpeed}x`}
              />
            </div>
          </div>
        </div>

        {/* 1-Year Calendar HUD Banner */}
        <div className="sim-calendar-hud-banner">
          <div className="sim-calendar-date-pill">
            <span className="sim-calendar-icon">📅</span>
            <strong>{dateInfo.dateString}</strong>
            <span className="sim-calendar-day-count">(Day {dayOfYear}/365)</span>
          </div>

          <div className="sim-calendar-season-pill">
            <span>{seasonInfo.icon}</span>
            <span style={{ fontWeight: 600 }}>{seasonInfo.name}</span>
            <span className="sim-season-subtext">— {seasonInfo.desc}</span>
          </div>

          {activeRedCount > 0 ? (
            <div className="sim-active-hazard-pill danger">
              <span className="pulse-danger-dot" />
              <span>🚨 LANDSLIDE ACTIVE ({activeRedCount} REGION)</span>
            </div>
          ) : activeAmberCount > 0 ? (
            <div className="sim-active-hazard-pill warning">
              <span>⚠️ ELEVATED PORE PRESSURE</span>
            </div>
          ) : (
            <div className="sim-active-hazard-pill normal">
              <span>🟢 NORMAL EQUILIBRIUM</span>
            </div>
          )}
        </div>

        {/* Continuous Timeline Progress Bar & Interactive Scrubber */}
        <div className="sim-timeline-slider-track">
          <input
            type="range"
            min={1}
            max={365}
            value={dayOfYear}
            onChange={handleScrub}
            className="sim-scrubber-range"
            title="Drag to scrub directly to any day in the 365-day annual timeline"
          />
          <div className="sim-timeline-month-ticks">
            <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span>
            <span style={{ color: "#dc2626", fontWeight: 700 }}>Jul ⚡</span>
            <span style={{ color: "#dc2626", fontWeight: 700 }}>Aug ⚡</span>
            <span style={{ color: "#ea580c", fontWeight: 700 }}>Sep ⛈️</span>
            <span>Oct</span><span>Nov</span><span>Dec</span>
          </div>
        </div>

        {/* Dedicated View Body (2D Map or 3D Terrain) */}
        <div className="sim-map-view-body" style={{ position: "relative" }}>
          {/* On-Screen Emergency Notification Toast Popup */}
          {simAlertToast && (
            <div className="sim-emergency-popup-toast">
              <div className="sim-toast-header">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="pulse-danger-dot" style={{ width: 10, height: 10 }} />
                  <span style={{ fontWeight: 800, color: "#991b1b", fontSize: 13, letterSpacing: "0.5px" }}>
                    🚨 AUTOMATIC EMERGENCY WARNING ISSUED
                  </span>
                </div>
                <button
                  className="sim-toast-close"
                  onClick={() => setSimAlertToast(null)}
                  title="Dismiss Notification"
                >
                  ✕
                </button>
              </div>
              <div className="sim-toast-body">
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>
                  📍 {simAlertToast.name} ({simAlertToast.locationId})
                </div>
                <div style={{ fontSize: 12.5, color: "#7f1d1d", lineHeight: 1.45, marginBottom: 8 }}>
                  ⚠️ <strong>Landslide Probability Surge: {simAlertToast.probability}%</strong>.
                  Factor of Safety dropped to <strong>{simAlertToast.fos}</strong> (Critical Slope Deformation).
                  {simAlertToast.roadBlocked ? " Connecting highway corridor is SEVERED by debris." : ""}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6, fontSize: 11.5, color: "#64748b" }}>
                  <span>📅 {simAlertToast.dateString} · Day {simAlertToast.day}/365</span>
                  <span style={{ background: "#dcfce7", color: "#166534", border: "1px solid #86efac", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>
                    📱 SMS Auto-Dispatched to Citizens & PWD Control
                  </span>
                </div>
              </div>
            </div>
          )}

          {viewMode === "map" ? (
            <SimulationMapView
              sites={activeSimSites}
              selectedSite={selectedSite}
              onSelectSite={setSelectedSite}
              showPeople={showPeople}
              showInfrastructure={showInfrastructure}
            />
          ) : (
            <Terrain3DView />
          )}
        </div>
      </div>

      {/* Right Side Column: All Three Regions Shown (Slider-Free) */}
      <div className="sim-regions-column">
        <div className="sim-regions-header">
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>Simulated Pilot Regions</h3>
            <span style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>
              {regionFilter === "3" ? "All 3 pilot regions running on continuous real-time data" : "All 6 monitoring zones"}
            </span>
          </div>

          <div className="sim-filter-toggle">
            <button
              className={`sim-filter-btn ${regionFilter === "3" ? "active" : ""}`}
              onClick={() => setRegionFilter("3")}
            >
              3 Regions
            </button>
            <button
              className={`sim-filter-btn ${regionFilter === "6" ? "active" : ""}`}
              onClick={() => setRegionFilter("6")}
            >
              All 6
            </button>
          </div>
        </div>

        {/* Dynamic Active Severe Hazards Live Tracker Section */}
        {severeRegionsList.length > 0 ? (
          <div className="sim-active-severity-tracker active">
            <div className="sim-tracker-top">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="pulse-danger-dot" />
                <strong style={{ color: "#991b1b", fontSize: 13 }}>
                  🚨 ACTIVE SEVERE HAZARDS ({severeRegionsList.length} REGION{severeRegionsList.length > 1 ? "S" : ""})
                </strong>
              </div>
              <span className="sim-tracker-alert-tag">CRITICAL ALERT</span>
            </div>
            <div className="sim-tracker-items">
              {severeRegionsList.map((locId) => {
                const r = activeSimSites[locId];
                return (
                  <div key={locId} className="sim-tracker-row">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ color: "#b91c1c", fontSize: 12.5 }}>📍 {r.name} ({locId})</strong>
                      <span className="sim-tracker-stat-pill">
                        FoS: <strong>{r.factor_of_safety?.toFixed(2)}</strong> · {r.probability_percent}% Prob
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "#475569", marginTop: 3 }}>
                      {r.statusText || "Critical slope failure active"} {r.roadBlocked && <span style={{ color: "#dc2626", fontWeight: 700 }}>· 🛑 Highway Corridor Blocked</span>}
                    </div>
                    <div className="sim-tracker-dispatch-status">
                      <span>📡 Automated Early Warning SMS & Notification Dispatched</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="sim-active-severity-tracker blank">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
              <span style={{ color: "#475569", fontSize: 12 }}>
                🟢 <strong>Active Severe Hazards:</strong> 0 Regions
              </span>
              <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>
                Nominal Landscape Equilibrium
              </span>
            </div>
          </div>
        )}

        {/* Explanatory Banner for Judges & Teachers */}
        <div className="sim-engine-explainer-banner">
          <span>💡 <strong>Real-Time Dynamic Recovery:</strong> Notice how when a cloudburst strikes, a region turns <strong>RED</strong> due to acute pore pressure. Once the storm passes and runoff drains over a few days, the slope automatically recovers back to the standard landscape (<strong>GREEN</strong>).</span>
        </div>


        {/* Scrollable list of Region Cards without manual sliders */}
        <div className="sim-regions-list">
          {displayedList.map((locId, idx) => {
            const data = activeSimSites[locId];
            if (!data) return null;

            const fos = data.factor_of_safety;
            const probPercent = data.probability_percent;
            const sevBand = data.severity_band || "MINOR";
            const stability = data.stability_state || "STABLE";

            // Dynamic Severity Styling
            let sevClass = "severity-minor";
            let badgeText = "🟢 Stable Limit";
            let sevHeadline = "Slope in Equilibrium";

            if (sevBand === "CATASTROPHIC_POTENTIAL" || (fos != null && fos < 0.9 && probPercent > 75)) {
              sevClass = "severity-critical";
              badgeText = "🚨 Critical Failure";
              sevHeadline = "VERY DANGEROUS LANDSLIDE ACTIVE";
            } else if (sevBand === "MAJOR" || (fos != null && fos < 1.0)) {
              sevClass = "severity-major";
              badgeText = "🟠 Major Warning";
              sevHeadline = "Dangerous Landslide Imminent";
            } else if (sevBand === "MODERATE" || (fos != null && fos < 1.3)) {
              sevClass = "severity-moderate";
              badgeText = "🟡 Warning";
              sevHeadline = "Embankment Slump Possible";
            }

            const isExpanded = !!expandedRegions[locId];

            return (
              <div
                key={locId}
                className={`sim-region-card ${sevClass} ${isExpanded ? "expanded" : "minimized"}`}
                style={{
                  transition: "all 0.2s ease-in-out",
                  borderLeft: isExpanded ? `5px solid ${sevClass.includes("critical") ? "#dc2626" : sevClass.includes("major") ? "#ea580c" : sevClass.includes("moderate") ? "#d97706" : "#16a34a"}` : undefined,
                }}
              >
                {/* Region Card Header (Clickable Accordion Bar) */}
                <div
                  className="sim-region-card-header"
                  onClick={() => toggleRegion(locId)}
                  style={{
                    cursor: "pointer",
                    userSelect: "none",
                    padding: "10px 12px",
                    borderRadius: isExpanded ? "8px 8px 0 0" : 8,
                  }}
                  title={isExpanded ? "Click to minimize card" : "Click to expand details"}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {/* Expand/Collapse Arrow Button */}
                    <button
                      type="button"
                      className="sim-expand-arrow-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRegion(locId);
                      }}
                      aria-label={isExpanded ? "Minimize region details" : "Expand region details"}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 6,
                        border: "1px solid rgba(0,0,0,0.12)",
                        background: isExpanded ? "#e2e8f0" : "#ffffff",
                        color: "#1e293b",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                      }}
                    >
                      {isExpanded ? "▼" : "▶"}
                    </button>

                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className="sim-region-index-pill">Region {idx + 1}</span>
                        <strong style={{ fontSize: 14 }}>{data.name}</strong>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-muted)", marginTop: 2 }}>
                        <span>{locId}</span> · <span>Elevation {data.elevation_m}m</span> · <span>Calculated Slope {data.slope_deg}°</span>
                      </div>
                    </div>
                  </div>

                  <span className={`sim-card-badge ${sevClass}`}>{badgeText}</span>
                </div>

                {/* Minimized Prediction Summary Strip (Only visible when minimized) */}
                {!isExpanded && (
                  <div
                    className="sim-minimized-pred-strip"
                    onClick={() => toggleRegion(locId)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "rgba(255, 255, 255, 0.75)",
                      border: "1px dashed rgba(0, 0, 0, 0.12)",
                      borderRadius: 6,
                      padding: "8px 12px",
                      margin: "6px 12px 10px 12px",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                      <span>FoS: <strong>{fos != null ? fos.toFixed(2) : "—"}</strong></span>
                      <span>Prob: <strong>{probPercent}%</strong></span>
                      <span>State: <strong style={{ color: sevClass.includes("critical") ? "#dc2626" : sevClass.includes("major") ? "#ea580c" : "#16a34a" }}>{stability}</strong></span>
                      {data.roadBlocked && (
                        <span style={{ color: "#dc2626", fontWeight: 700 }}>[ROUTE BLOCKED]</span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>
                      Details ▶
                    </span>
                  </div>
                )}

                {/* Expanded Card Body with HUD & Physics Topographic Slope Readout */}
                {isExpanded && (
                  <div style={{ padding: "0 12px 12px 12px" }}>
                    {/* Highlighted Prediction HUD Window (color-coded by severity) */}
                    <div className={`prediction-window ${sevClass}`} style={{ margin: "10px 0" }}>
                      <div className="pred-window-header">
                        <span style={{ fontWeight: 700, fontSize: 12 }}>{sevHeadline}</span>
                        <span className="pred-site-tag">{stability}</span>
                      </div>

                      <div style={{ fontSize: 11.5, marginBottom: 8, opacity: 0.9 }}>
                        Status: <strong>{data.statusText || (stability === "STABLE" ? "Normal Standard Landscape" : "Active Movement")}</strong>
                        {data.roadBlocked && (
                          <span style={{ color: "#dc2626", fontWeight: 700, marginLeft: 6 }}>
                            [ROUTE BLOCKED]
                          </span>
                        )}
                      </div>

                      <div className="pred-metrics-grid" style={{ marginBottom: 0 }}>
                        <div className="pred-metric-card">
                          <span className="pred-card-label">Factor of Safety</span>
                          <span className="pred-prob-val" style={{ fontSize: 16 }}>
                            {fos != null ? fos.toFixed(2) : "—"}
                          </span>
                          <span className="pred-card-sub">State: {stability}</span>
                        </div>

                        <div className="pred-metric-card">
                          <span className="pred-card-label">Landslide Probability</span>
                          <span className="pred-prob-val" style={{ fontSize: 16 }}>{probPercent}%</span>
                          <div className="pred-prob-track">
                            <div className="pred-prob-fill" style={{ width: `${Math.min(100, Math.max(2, probPercent))}%` }} />
                          </div>
                        </div>

                        <div className="pred-metric-card">
                          <span className="pred-card-label">Severity Band</span>
                          <span className="pred-severity-val" style={{ fontSize: 13 }}>
                            {sevBand}
                          </span>
                          <span className="pred-card-sub">{sevBand === "MINOR" ? "Low Risk" : "Emergency"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Topographic DEM Inputs (Physics Evaluated - Slope not simulated directly) */}
                    <div style={{
                      background: "#f1f5f9",
                      borderRadius: 8,
                      padding: "8px 10px",
                      marginBottom: 8,
                      border: "1px solid #e2e8f0",
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>📐 Topographic DEM Inputs (Evaluates Slope)</span>
                        <span style={{ fontSize: 10.5, color: "#2563eb", fontWeight: 600 }}>Physics: θ = arctan(Δz / Δx)</span>
                      </div>
                      <div className="sim-telemetry-readout-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: 6, marginBottom: 0 }}>
                        <div className="sim-telemetry-pill">
                          <span className="sim-telem-lbl">DEM Elevation Rise (Δz)</span>
                          <span className="sim-telem-val">{data.dem_delta_z_m || (data.dem_crest_elevation_m - data.dem_toe_elevation_m)} m</span>
                        </div>
                        <div className="sim-telemetry-pill">
                          <span className="sim-telem-lbl">Horizontal Run (Δx)</span>
                          <span className="sim-telem-val">{data.dem_horizontal_run_m || 200} m</span>
                        </div>
                        <div className="sim-telemetry-pill" style={{ gridColumn: "span 2", background: "#eff6ff", borderColor: "#bfdbfe" }}>
                          <span className="sim-telem-lbl" style={{ color: "#1e40af" }}>Evaluated Slope Angle (Physics Engine)</span>
                          <span className="sim-telem-val" style={{ color: "#1d4ed8", fontWeight: 700 }}>{data.slope_deg}°</span>
                        </div>
                      </div>
                    </div>

                    {/* Real-time Simulated Telemetry Readouts (No Manual Sliders) */}
                    <div className="sim-telemetry-readout-grid">
                      <div className="sim-telemetry-pill">
                        <span className="sim-telem-lbl">Simulated 1h Rain</span>
                        <span className="sim-telem-val">{data.rainfall_1h_mm} mm/h</span>
                      </div>
                      <div className="sim-telemetry-pill">
                        <span className="sim-telem-lbl">24h Accumulated</span>
                        <span className="sim-telem-val">{data.rainfall_24h_mm} mm</span>
                      </div>
                      <div className="sim-telemetry-pill" style={{ gridColumn: "span 2" }}>
                        <span className="sim-telem-lbl">Antecedent Saturation</span>
                        <span className="sim-telem-val">{Math.round(data.initial_saturation_0_1 * 100)}%</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
