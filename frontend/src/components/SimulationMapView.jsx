import { useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Polyline, Tooltip, Popup } from "react-leaflet";
import L from "leaflet";
import { MOCK_POPULATION, ROAD_CORRIDORS, SIKKIM_SETTLEMENTS } from "../data/mockPopulation";
import "leaflet/dist/leaflet.css";

const createHumanIcon = (status) => {
  const isEvac = status.isDanger;
  return L.divIcon({
    className: "custom-human-leaflet-icon",
    html: `
      <div class="human-pin ${isEvac ? 'pulse-danger-pin' : ''}">
        <div class="human-pin-body" style="background: ${status.color};">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="#ffffff">
            <circle cx="12" cy="7" r="4" />
            <path d="M12 14c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5z" />
          </svg>
        </div>
        <div class="human-pin-arrow" style="border-top-color: ${status.color};"></div>
      </div>
    `,
    iconSize: [26, 32],
    iconAnchor: [13, 32],
    popupAnchor: [0, -30],
  });
};

const SEVERITY_COLORS = {
  CATASTROPHIC_POTENTIAL: "#b91c1c",
  MAJOR: "#ea580c",
  MODERATE: "#d97706",
  MINOR: "#16a34a",
};

const STABILITY_FALLBACK = {
  UNSTABLE: "#dc2626",
  MARGINAL: "#d97706",
  STABLE: "#16a34a",
  UNKNOWN: "#64748b",
};

function getSiteColor(data) {
  if (!data) return STABILITY_FALLBACK.UNKNOWN;
  const band = data?.severity?.severity_band || data?.severity_band;
  if (band && SEVERITY_COLORS[band]) return SEVERITY_COLORS[band];
  const stability = data?.prediction?.physics_output?.stability_state || data?.stability_state;
  return STABILITY_FALLBACK[stability] || STABILITY_FALLBACK.UNKNOWN;
}

export function SimulationMapView({ sites = {}, selectedSite, onSelectSite, showPeople = true, showInfrastructure = false }) {
  const [mapLayer, setMapLayer] = useState("streets");
  const entries = Object.entries(sites);
  const firstData = entries[0]?.[1];
  const center = entries.length && entries[0][1]?.latitude
    ? [entries[0][1].latitude, entries[0][1].longitude]
    : [27.599, 88.6483];

  // Dynamically compute live safety status for each citizen based on simulation telemetry
  function getCitizenStatus(citizen) {
    const nearSite = sites[citizen.nearLocationId];
    const stability = nearSite?.prediction?.physics_output?.stability_state || nearSite?.stability_state || "STABLE";
    const sevBand = nearSite?.severity?.severity_band || nearSite?.severity_band || "MINOR";
    const fos = nearSite?.prediction?.physics_output?.factor_of_safety ?? nearSite?.factor_of_safety;
    const spatial = nearSite?.spatial_context || {};
    const affectedVillages = spatial.affected_villages || [];
    const nearestTown = spatial.nearest_town;
    const roadName = spatial.primary_road_corridor || spatial.nearest_road?.name || nearSite?.current_params?.name || nearSite?.name || "Mountain Highway";
    const siteParams = nearSite?.current_params || nearSite;

    if (stability === "UNSTABLE" || sevBand === "CATASTROPHIC_POTENTIAL" || (fos != null && fos < 1.0)) {
      let distKm = 999;
      if (siteParams?.latitude && siteParams?.longitude) {
        const dLat = (citizen.lat - siteParams.latitude) * 111.0;
        const dLon = (citizen.lon - siteParams.longitude) * 111.0 * Math.cos((citizen.lat * Math.PI) / 180);
        distKm = Math.sqrt(dLat * dLat + dLon * dLon);
      }

      const townMatch = affectedVillages.some((v) =>
        citizen.town.toLowerCase().includes(v.name.toLowerCase()) || v.name.toLowerCase().includes(citizen.town.toLowerCase())
      ) || (nearestTown && (citizen.town.toLowerCase().includes(nearestTown.name.toLowerCase()) || nearestTown.name.toLowerCase().includes(citizen.town.toLowerCase())));

      const isImmediate = distKm <= 3.5 || townMatch;
      if (isImmediate) {
        return {
          badge: "🚨 URGENT EVACUATION",
          color: "#dc2626",
          alertText: `HIGH HAZARD: Immediate landslide failure on ${roadName}. Evacuate to reinforced emergency shelter.`,
          isDanger: true,
        };
      }
      return {
        badge: "⚠️ TRANSIT DETOUR ADVISORY",
        color: "#ea580c",
        alertText: `CORRIDOR SEVERED: Road sector at ${citizen.nearLocationId} is blocked. Seek alternative route.`,
        isDanger: false,
      };
    } else if (stability === "MARGINAL" || sevBand === "MODERATE" || (fos != null && fos < 1.3)) {
      return {
        badge: "🟡 PREPARE & MONITOR",
        color: "#d97706",
        alertText: `ADVISORY: Saturation rising along ${roadName}. Avoid traveling near steep rock cuts.`,
        isDanger: false,
      };
    }
    return {
      badge: "🟢 SAFE CONDITION",
      color: "#16a34a",
      alertText: `NOMINAL: Slope equilibrium normal. Open transit permitted.`,
      isDanger: false,
    };
  }

  let evacCount = 0;
  if (showPeople) {
    MOCK_POPULATION.forEach((c) => {
      if (getCitizenStatus(c).isDanger) evacCount++;
    });
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Floating Map Layer Switcher: Street vs Satellite */}
      <div className="map-layer-switcher">
        <button
          className={`map-layer-btn ${mapLayer === "streets" ? "active" : ""}`}
          onClick={() => setMapLayer("streets")}
        >
          🗺️ Streets
        </button>
        <button
          className={`map-layer-btn ${mapLayer === "satellite" ? "active" : ""}`}
          onClick={() => setMapLayer("satellite")}
        >
          🛰️ Satellite
        </button>
      </div>

      {/* Active Evacuation Counter Pill */}
      {showPeople && evacCount > 0 && (
        <div className="sim-map-evac-pill">
          <span className="pulse-danger-dot" />
          <span>🚨 {evacCount} Citizens in Simulated Evacuation Zone</span>
        </div>
      )}

      {/* Map Severity Legend */}
      <div className="map-floating-legend">
        <div className="legend-title">Simulation Hazard State</div>
        <div className="legend-item"><span className="legend-dot critical" /> Critical (FoS &lt; 0.9)</div>
        <div className="legend-item"><span className="legend-dot major" /> Major Warning (FoS &lt; 1.0)</div>
        <div className="legend-item"><span className="legend-dot moderate" /> Moderate (FoS &lt; 1.3)</div>
        <div className="legend-item"><span className="legend-dot stable" /> Stable (FoS &ge; 1.5)</div>
        {showInfrastructure && (
          <>
            <div className="legend-item" style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid #e2e8f0" }}>
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#fbbf24", border: "1.5px solid #b45309", marginRight: 6 }} />
              Nearby Town / Settlement
            </div>
            <div className="legend-item">
              <span style={{ display: "inline-block", width: 14, height: 3, background: "#475569", marginRight: 6, verticalAlign: "middle" }} />
              Govt Highway Corridor (BRO/PWD)
            </div>
          </>
        )}
      </div>

      <MapContainer center={center} zoom={9} style={{ height: "100%", width: "100%" }}>
        {mapLayer === "streets" ? (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        ) : (
          <TileLayer
            attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        )}

        {/* Toggleable Government Highway Corridors */}
        {showInfrastructure &&
          ROAD_CORRIDORS.map((road) => {
            const nearSite = sites[road.nearLocationId];
            const stability = nearSite?.prediction?.physics_output?.stability_state || "STABLE";
            const fos = nearSite?.prediction?.physics_output?.factor_of_safety;
            const isBlocked = stability === "UNSTABLE" || (fos != null && fos < 1.0);
            const isMarginal = stability === "MARGINAL" || (fos != null && fos < 1.3);

            const roadColor = isBlocked ? "#dc2626" : isMarginal ? "#d97706" : "#475569";
            const roadWeight = isBlocked ? 6 : isMarginal ? 4 : 3;
            const dash = isBlocked ? "8 6" : isMarginal ? "5 5" : undefined;

            return (
              <Polyline
                key={road.id}
                positions={road.points}
                pathOptions={{
                  color: roadColor,
                  weight: roadWeight,
                  dashArray: dash,
                  opacity: 0.9,
                }}
              >
                <Popup>
                  <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                    <strong>🛣️ {road.name}</strong><br />
                    <span style={{ color: isBlocked ? "#dc2626" : "#475569", fontWeight: 600 }}>
                      {isBlocked ? "🚨 ROAD SEVERED / LANDSLIDE DEBRIS" : isMarginal ? "⚠️ TRAFFIC RESTRICTION" : "🟢 OPEN CORRIDOR"}
                    </span>
                    <div style={{ marginTop: 4, fontSize: 11.5, color: "#64748b" }}>
                      Official highway transit corridor connecting North Sikkim valleys.
                    </div>
                  </div>
                </Popup>
              </Polyline>
            );
          })}

        {/* Toggleable Comprehensive Nearby Towns & Settlements Layer */}
        {showInfrastructure &&
          SIKKIM_SETTLEMENTS.map((town) => (
            <CircleMarker
              key={town.id}
              center={[town.latitude, town.longitude]}
              radius={6}
              pathOptions={{
                color: "#92400e",
                fillColor: "#fbbf24",
                fillOpacity: 0.95,
                weight: 2,
              }}
            >
              <Tooltip direction="top" offset={[0, -5]} opacity={0.9}>
                <span>🏘️ <strong>{town.name}</strong> ({town.population.toLocaleString()} pop)</span>
              </Tooltip>
              <Popup>
                <div style={{ fontSize: 13, lineHeight: 1.45 }}>
                  <strong>🏘️ {town.name}</strong><br />
                  <span style={{ color: "#64748b", fontSize: 11.5 }}>{town.category} · {town.district}</span><br />
                  <div style={{ marginTop: 6, fontSize: 12 }}>
                    <span>Population: <strong>{town.population.toLocaleString()} residents</strong></span><br />
                    <span>Elevation: <strong>{town.elevation_m}m</strong></span>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}

        {/* Monitored Region Markers */}
        {entries.map(([locationId, data]) => {
          const params = data?.current_params || data;
          if (!params?.latitude || !params?.longitude) return null;

          const color = getSiteColor(data);
          const stability = data?.prediction?.physics_output?.stability_state || data?.stability_state || "UNKNOWN";
          const sevBand = data?.severity?.severity_band || data?.severity_band || "MINOR";
          const fos = data?.prediction?.physics_output?.factor_of_safety ?? data?.factor_of_safety;
          const isUnstable = stability === "UNSTABLE" || data?.roadBlocked || (fos != null && fos < 1.0);
          const isMarginal = stability === "MARGINAL" || (fos != null && fos < 1.3);
          const isSelected = selectedSite === locationId;

          return (
            <div key={locationId}>
              {(isUnstable || isMarginal || isSelected) && (
                <CircleMarker
                  center={[params.latitude, params.longitude]}
                  radius={isSelected ? 32 : 24}
                  pathOptions={{
                    color: color,
                    fillColor: color,
                    fillOpacity: isUnstable ? 0.25 : 0.12,
                    weight: isUnstable ? 2.5 : 1.5,
                    dashArray: isUnstable ? "6 4" : undefined,
                  }}
                />
              )}

              <CircleMarker
                center={[params.latitude, params.longitude]}
                radius={isSelected ? 13 : 10}
                pathOptions={{
                  color: "#FFFFFF",
                  fillColor: color,
                  fillOpacity: 0.95,
                  weight: 3,
                }}
                eventHandlers={{ click: () => onSelectSite && onSelectSite(locationId) }}
              >
                <Popup>
                  <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                    <strong>🏔️ {params.name}</strong><br />
                    <span style={{ color: "#64748b" }}>{locationId} · Elevation {params.elevation_m}m</span><br />
                    <div style={{ marginTop: 6 }}>
                      <span>Stability: <strong>{stability}</strong></span><br />
                      <span>Factor of Safety: <strong>{fos != null ? fos.toFixed(2) : "—"}</strong></span><br />
                      <span>Severity: <strong style={{ color }}>{sevBand}</strong></span>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            </div>
          );
        })}

        {/* Toggleable Population & Observers with Authentic SVG Human Avatars */}
        {showPeople &&
          MOCK_POPULATION.map((person) => {
            const status = getCitizenStatus(person);
            return (
              <Marker
                key={person.id}
                position={[person.lat, person.lon]}
                icon={createHumanIcon(status)}
              >
                <Popup>
                  <div style={{ fontSize: 13, lineHeight: 1.45, minWidth: 215 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <strong style={{ fontSize: 14 }}>👤 {person.name}</strong>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: 4,
                        color: "#FFFFFF",
                        backgroundColor: status.color,
                      }}>
                        {status.badge}
                      </span>
                    </div>
                    <div style={{ color: "#475569", fontSize: 11.5, marginBottom: 4 }}>
                      <span>{person.role}</span> · <span>📍 {person.town}</span>
                    </div>
                    <div style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: status.isDanger ? "#fef2f2" : "#f8fafc",
                      border: `1px solid ${status.isDanger ? "#fca5a5" : "#e2e8f0"}`,
                      fontSize: 11.5,
                      color: status.isDanger ? "#991b1b" : "#334155",
                      marginBottom: 6,
                    }}>
                      💬 {status.alertText}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>
                      📞 {person.phone} · 🗣️ {person.language}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
      </MapContainer>
    </div>
  );
}
