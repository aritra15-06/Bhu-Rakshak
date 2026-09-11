import { useState, useEffect, useRef } from "react";
import { SimulationMapView } from "./SimulationMapView";
import {
  getDailySimulationState,
  getCalendarDate,
  getSeason,
  TOTAL_SIMULATION_DAYS,
} from "../data/annualSimulationTimeline";

const CORE_REGIONS = ["LOC01", "LOC02", "LOC03"];
const ALL_ZONES = ["LOC01", "LOC02", "LOC03", "LOC04", "LOC05", "LOC06"];

export const LOCATION_ROAD_NAMES = {
  LOC01: "NH-10 North Sikkim Highway (Mangan-Chungthang)",
  LOC02: "NH-10 Teesta Valley Highway (Mangan-Dikchu)",
  LOC03: "SH-1 Chungthang-Lachung Highway Corridor",
  LOC04: "SH-2 Chungthang-Lachen Highway Corridor",
  LOC05: "NH-10 Highway Corridor (Singtam-Rangpo)",
  LOC06: "NH-10 Highway Corridor (Mangan Ridge Cut)",
};

export function getRoadName(locId, siteData) {
  if (siteData?.primary_road_corridor) {
    return siteData.primary_road_corridor;
  }
  if (siteData?.spatial_context?.primary_road_corridor) {
    return siteData.spatial_context.primary_road_corridor;
  }
  return LOCATION_ROAD_NAMES[locId] || siteData?.name || "Mountain Highway Corridor";
}

export function SimulationWorkspace() {
  const [showPeople, setShowPeople] = useState(true);
  const [showInfrastructure, setShowInfrastructure] = useState(false);
  const [regionFilter, setRegionFilter] = useState("3"); // "3" or "6"
  const [selectedSite, setSelectedSite] = useState("LOC01");
  const [expandedRegions, setExpandedRegions] = useState({});
  const [simAlertToast, setSimAlertToast] = useState(null);
  const triggeredAlertsRef = useRef(new Set());

  // Custom User-Added Locations & Map Location Picker State
  const [customSites, setCustomSites] = useState({});
  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [pickingLoading, setPickingLoading] = useState(false);
  const [customFeedbackToast, setCustomFeedbackToast] = useState(null);

  function toggleRegion(locId) {
    setExpandedRegions((prev) => ({
      ...prev,
      [locId]: !prev[locId],
    }));
  }

  // High-Impact Monsoon Simulation Engine (June to October: 153 Days)
  // ~45 seconds for the full 153-day crisis at 1x
  const [dayOfYear, setDayOfYear] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 0.25x, 0.5x, 1x, 2x, 3x
  const [isControlsExpanded, setIsControlsExpanded] = useState(true);
  const timerRef = useRef(null);

  // Active state derived from current day in monsoon simulation timeline
  const annualFrame = getDailySimulationState(dayOfYear, customSites);
  const dateInfo = getCalendarDate(dayOfYear);
  const seasonInfo = getSeason(dayOfYear);

  // Active sites object passed to the map and cards
  const activeSimSites = {
    ...annualFrame.regions,
  };

  const displayedList = regionFilter === "3"
    ? [...CORE_REGIONS, ...Object.keys(customSites)]
    : [...ALL_ZONES, ...Object.keys(customSites)];

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

  // Playback timer loop supporting fractional speeds below 1x (~45s at 1x for 153 days)
  useEffect(() => {
    if (isPlaying) {
      const intervalMs = Math.max(30, Math.round(280 / playbackSpeed));
      timerRef.current = setInterval(() => {
        setDayOfYear((prev) => {
          if (prev >= TOTAL_SIMULATION_DAYS) {
            setIsPlaying(false);
            return TOTAL_SIMULATION_DAYS;
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
    if (dayOfYear >= TOTAL_SIMULATION_DAYS) {
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

  function handleMapClick(lat, lon) {
    if (!isPickingLocation) return;
    setIsPickingLocation(false);
    setPickingLoading(true);

    fetch("/api/locations/custom-inspect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude: lat, longitude: lon }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data && data.location_id) {
          setCustomSites((prev) => ({
            ...prev,
            [data.location_id]: data,
          }));
          setSelectedSite(data.location_id);
          setCustomFeedbackToast({
            title: "📍 Custom Monitoring Station Added!",
            name: data.name,
            road: data.primary_road_corridor,
            elev: data.elevation_m,
            slope: data.slope_deg,
            prob: data.probability_percent,
          });
          setTimeout(() => setCustomFeedbackToast(null), 8000);
        }
      })
      .catch((err) => {
        console.error("Failed to inspect custom location:", err);
        alert("Could not inspect location at this coordinate. Please try clicking another point on the map.");
      })
      .finally(() => setPickingLoading(false));
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

          const roadName = getRoadName(locId, r);
          const prob = Math.round(r.probability_percent);
          const alertMessage = `There is a ${prob}% probability of a landslide in the road connecting ${roadName}.`;
          const actionDirective = "Immediate action required: Evacuate immediately to designated relief shelters on higher ground. Strictly avoid all vehicular travel on this road.";

          // 1. Trigger on-screen Notification Popup Toast
          setSimAlertToast({
            id: `${locId}_${Date.now()}`,
            locationId: locId,
            name: r.name,
            roadName: roadName,
            day: dayOfYear,
            dateString: dateInfo.dateString,
            probability: prob,
            alertMessage: alertMessage,
            actionDirective: actionDirective,
            severity: r.severity_band || "CATASTROPHIC_POTENTIAL",
            statusText: r.statusText,
            roadBlocked: r.roadBlocked,
          });

          // 2. Automated SMS dispatch and persistent history recording
          fetch("/api/alerts/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ location_id: locId, dry_run: true }),
          }).catch((err) => {
            console.warn("Auto simulation alert dispatch:", err);
          });

          fetch("/api/alerts/history/record", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location_id: locId,
              location_name: r.name,
              road_corridor: roadName,
              probability_percent: prob,
              severity_band: r.severity_band || "MAJOR",
              message: alertMessage,
              action_directive: actionDirective,
              date_string: dateInfo.dateString,
              road_blocked: Boolean(r.roadBlocked),
              rainfall_24h_mm: r.rainfall_24h_mm || 180.0,
              rainfall_1h_mm: r.rainfall_1h_mm || 25.0,
            }),
          }).catch((err) => {
            console.warn("Auto simulation history record:", err);
          });
        }
      }
    });
  }, [dayOfYear, regionFilter, dateInfo.dateString]);

  // Auto-dismiss emergency popup toast after 8 seconds
  useEffect(() => {
    if (!simAlertToast) return;
    const timer = setTimeout(() => {
      setSimAlertToast(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [simAlertToast]);


  return (
    <div className="sim-workspace-layout">
      {/* On-Screen Emergency Notification Toast Popup - Fixed to top-right of entire website */}
      {simAlertToast && (
        <div className="sim-emergency-popup-toast">
          <div className="sim-toast-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="pulse-danger-dot" style={{ width: 10, height: 10 }} />
              <span style={{ fontWeight: 800, color: "#991b1b", fontSize: 13, letterSpacing: "0.5px" }}>
                🚨 EMERGENCY CITIZEN WARNING
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
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>
              📍 {simAlertToast.name} · {simAlertToast.roadName}
            </div>
            <div style={{ fontSize: 13, color: "#7f1d1d", lineHeight: 1.45, marginBottom: 8, fontWeight: 700, background: "#fee2e2", padding: "8px 10px", borderRadius: 6, border: "1px solid #fca5a5" }}>
              📢 {simAlertToast.alertMessage}
              {simAlertToast.roadBlocked ? " Connecting highway corridor is SEVERED by debris." : ""}
            </div>
            <div style={{ fontSize: 12, color: "#1e293b", lineHeight: 1.45, marginBottom: 8, background: "#f8fafc", padding: "8px 10px", borderRadius: 6, border: "1px solid #e2e8f0" }}>
              👉 <strong>Citizen Directive:</strong> {simAlertToast.actionDirective}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6, fontSize: 11.5, color: "#64748b" }}>
              <span>📅 {simAlertToast.dateString} · Day {simAlertToast.day}/{TOTAL_SIMULATION_DAYS}</span>
              <span style={{ background: "#dcfce7", color: "#166534", border: "1px solid #86efac", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>
                📱 Citizen SMS Broadcast Auto-Dispatched
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Custom Location Added Notification Toast */}
      {customFeedbackToast && (
        <div className="custom-loc-success-toast">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <strong style={{ color: "#1e1b4b", fontSize: 13 }}>{customFeedbackToast.title}</strong>
            <button
              className="sim-toast-close"
              onClick={() => setCustomFeedbackToast(null)}
              title="Close"
              style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 14 }}
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#4338ca", marginBottom: 3 }}>
            {customFeedbackToast.name}
          </div>
          <div style={{ fontSize: 11.5, color: "#334155", lineHeight: 1.45 }}>
            🛣️ Connecting Highway: <strong>{customFeedbackToast.road}</strong><br />
            📐 Elevation: <strong>{customFeedbackToast.elev} m</strong> · Physics Slope: <strong>{customFeedbackToast.slope}°</strong><br />
            📊 Simulated Monsoon Risk: <strong>{customFeedbackToast.prob}% Probability</strong>
          </div>
        </div>
      )}

      {/* Custom Location GIS Loading Overlay */}
      {pickingLoading && (
        <div className="custom-loc-loading-toast">
          <span className="spinner-mini" style={{ width: 14, height: 14, border: "2px solid #818cf8", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />
          <span>Querying GIS topography, live DEM & connecting highways...</span>
        </div>
      )}

      {/* Left / Center Section: Dedicated Map */}
      <div className="sim-map-container">
        {/* Collapsible Simulation Controls Section */}
        {isControlsExpanded ? (
          <>
            {/* Top Controls Toolbar: Original Full Previous Version */}
            <div className="sim-map-topbar">
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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

                <button
                  className={`sim-custom-loc-btn ${isPickingLocation ? "active-picking" : ""}`}
                  onClick={() => setIsPickingLocation(!isPickingLocation)}
                  title="Click anywhere on the map in North Sikkim to inspect live DEM topography and add a custom monitoring site"
                >
                  <span>{isPickingLocation ? "🎯 Cancel Pin Picking" : "📍 Add Custom Location"}</span>
                  {customSites && Object.keys(customSites).length > 0 && (
                    <span className="sim-custom-count-badge">
                      {Object.keys(customSites).length} Added
                    </span>
                  )}
                </button>
              </div>

              <div className="sim-timeline-ctrl-strip">
                <button
                  className={`btn btn-sm ${isPlaying ? "btn-warning" : "btn-primary"}`}
                  onClick={handlePlayPause}
                  style={{ fontWeight: 700 }}
                >
                  {isPlaying ? "⏸️ Pause" : (dayOfYear >= TOTAL_SIMULATION_DAYS ? "🔄 Replay Monsoon (45s)" : "▶️ Play Monsoon Simulation (45s)")}
                </button>
                <button
                  className="btn btn-sm"
                  onClick={handleReplay}
                  title="Reset and start monsoon replay from June 1"
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

                {/* Minimize Arrow Button */}
                <button
                  type="button"
                  className="sim-collapse-arrow-btn"
                  onClick={() => setIsControlsExpanded(false)}
                  title="Minimize controls section to maximize map view"
                  aria-label="Minimize controls section"
                >
                  ▲
                </button>
              </div>
            </div>

            {/* Monsoon Calendar HUD Banner */}
            <div className="sim-calendar-hud-banner">
              <div className="sim-calendar-date-pill">
                <span className="sim-calendar-icon">📅</span>
                <strong>{dateInfo.dateString}</strong>
                <span className="sim-calendar-day-count">(Day {dayOfYear}/{TOTAL_SIMULATION_DAYS})</span>
              </div>

              <div className="sim-calendar-season-pill">
                <span>{seasonInfo.icon}</span>
                <span style={{ fontWeight: 600 }}>{seasonInfo.name}</span>
                <span className="sim-season-subtext">— {seasonInfo.desc}</span>
              </div>

              {activeRedCount > 0 ? (
                <div className="sim-active-hazard-pill danger">
                  <span className="pulse-danger-dot" />
                  <span>🚨 LANDSLIDE ACTIVE ({activeRedCount} REGION{activeRedCount > 1 ? "S" : ""})</span>
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
          </>
        ) : (
          /* Minimized Header Strip with Expand Arrow */
          <div
            className="sim-map-topbar-minimized"
            onClick={() => setIsControlsExpanded(true)}
            title="Click to expand controls"
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                className="sim-collapse-arrow-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsControlsExpanded(true);
                }}
                title="Click to expand controls"
                aria-label="Expand controls"
              >
                ▼
              </button>
              <span style={{ fontWeight: 700, color: "#1e293b", fontSize: 12.5 }}>
                Monsoon Controls (Minimized)
              </span>
              <span style={{ color: "#64748b", fontSize: 12 }}>·</span>
              <span style={{ fontSize: 12, color: "#334155" }}>
                📅 <strong>{dateInfo.dateString}</strong> (Day {dayOfYear}/{TOTAL_SIMULATION_DAYS}) · {seasonInfo.icon} {seasonInfo.name}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={(e) => e.stopPropagation()}>
              <button
                className={`btn btn-sm ${isPlaying ? "btn-warning" : "btn-primary"}`}
                onClick={handlePlayPause}
                style={{ fontWeight: 700, padding: "3px 10px", fontSize: 12 }}
              >
                {isPlaying ? "⏸️ Pause" : "▶️ Play"}
              </button>
              <button
                type="button"
                className="sim-collapse-arrow-btn"
                onClick={() => setIsControlsExpanded(true)}
                title="Click to expand controls"
                aria-label="Expand controls"
              >
                ▼
              </button>
            </div>
          </div>
        )}

        {/* Continuous Monsoon Timeline Progress Bar & Interactive Scrubber (Slim Height) */}
        <div className="sim-timeline-slider-track">
          <input
            type="range"
            min={1}
            max={TOTAL_SIMULATION_DAYS}
            value={dayOfYear}
            onChange={handleScrub}
            className="sim-scrubber-range"
            title="Drag to scrub directly across the June-October monsoon timeline (153 Days)"
          />
          <div className="sim-timeline-month-ticks">
            <span style={{ color: "#0284c7", fontWeight: 700 }}>Jun 🌧️ (Onset)</span>
            <span style={{ color: "#dc2626", fontWeight: 700 }}>Jul ⚡ (Cloudburst)</span>
            <span style={{ color: "#dc2626", fontWeight: 700 }}>Aug ⚡ (High Deluge)</span>
            <span style={{ color: "#ea580c", fontWeight: 700 }}>Sep ⛈️ (Late Runoff)</span>
            <span style={{ color: "#16a34a", fontWeight: 600 }}>Oct 🍂 (Seepage)</span>
          </div>
        </div>

        {/* Dedicated 2D Simulation Map View */}
        <div className="sim-map-view-body">
          <SimulationMapView
            sites={activeSimSites}
            selectedSite={selectedSite}
            onSelectSite={setSelectedSite}
            showPeople={showPeople}
            showInfrastructure={showInfrastructure}
            isPickingLocation={isPickingLocation}
            onMapClick={handleMapClick}
            onCancelPickLocation={() => setIsPickingLocation(false)}
          />
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
                const roadName = getRoadName(locId, r);
                const prob = Math.round(r.probability_percent);
                return (
                  <div key={locId} className="sim-tracker-row">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ color: "#b91c1c", fontSize: 12.5 }}>📍 {r.name}</strong>
                      <span className="sim-tracker-stat-pill" style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" }}>
                        <strong>{prob}% Probability</strong>
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#991b1b", marginTop: 4, fontWeight: 600, lineHeight: 1.4 }}>
                      📢 There is a {prob}% probability of a landslide in the road connecting {roadName}.
                    </div>
                    <div style={{ fontSize: 11.5, color: "#334155", marginTop: 3, background: "#f8fafc", padding: "4px 8px", borderRadius: 4, border: "1px solid #e2e8f0", lineHeight: 1.35 }}>
                      👉 <strong>Action:</strong> Evacuate to designated relief shelters on higher ground. Avoid all vehicular travel on {roadName}.
                    </div>
                    <div className="sim-tracker-dispatch-status" style={{ marginTop: 4 }}>
                      <span>📡 Automated Citizen Emergency SMS Dispatched</span>
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
                        {data.is_custom ? (
                          <span className="sim-region-index-pill custom-pill" style={{ background: "#7c3aed", color: "#ffffff", fontWeight: 700 }}>
                            📍 CUSTOM
                          </span>
                        ) : (
                          <span className="sim-region-index-pill">Region {idx + 1}</span>
                        )}
                        <strong style={{ fontSize: 14 }}>{data.name}</strong>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-muted)", marginTop: 2 }}>
                        <span>{locId}</span> · <span>Elev {data.elevation_m}m</span> · <span>Slope {data.slope_deg}°</span>
                        {data.primary_road_corridor && (
                          <span> · <strong style={{ color: "#2563eb" }}>{data.primary_road_corridor}</strong></span>
                        )}
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
                      <span>Landslide Risk: <strong>{probPercent}% Probability</strong></span>
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
