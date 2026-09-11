import { useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Polyline, Tooltip, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { MOCK_POPULATION, ROAD_CORRIDORS, SIKKIM_SETTLEMENTS } from "../data/mockPopulation";
import "leaflet/dist/leaflet.css";

function MapClickHandler({ isPickingLocation, onMapClick }) {
  useMapEvents({
    click(e) {
      if (isPickingLocation && onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

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

const LOCATION_ROAD_NAMES = {
  LOC01: "NH-10 North Sikkim Highway (Mangan-Chungthang)",
  LOC02: "NH-10 Teesta Valley Corridor (Gangtok-Mangan-Dikchu)",
  LOC03: "SH-1 Chungthang-Lachung Highway Corridor",
  LOC04: "SH-2 Chungthang-Lachen Highway Corridor",
  LOC05: "NH-10 Teesta Corridor (Singtam-Rangpo)",
  LOC06: "Jawaharlal Nehru Road (Gangtok-Tsomgo-Nathula)",
};

export function SimulationMapView({
  sites = {},
  selectedSite,
  onSelectSite,
  showPeople = true,
  showInfrastructure = false,
  isPickingLocation = false,
  onMapClick,
  onCancelPickLocation,
}) {
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
    const prob = Math.round(nearSite?.probability_percent ?? (nearSite?.calibrated_probability != null ? nearSite.calibrated_probability * 100 : 80));
    const spatial = nearSite?.spatial_context || {};
    const affectedVillages = spatial.affected_villages || [];
    const nearestTown = spatial.nearest_town;
    const roadName = spatial.primary_road_corridor || spatial.nearest_road?.name || LOCATION_ROAD_NAMES[citizen.nearLocationId] || nearSite?.current_params?.name || nearSite?.name || "Mountain Highway";
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
          alertText: `There is a ${prob}% probability of a landslide in the road connecting ${roadName}. Immediate action: Evacuate immediately to designated relief shelters on higher ground. Strictly avoid all vehicular travel on ${roadName}.`,
          isDanger: true,
        };
      }
      return {
        badge: "⚠️ TRANSIT DETOUR ADVISORY",
        color: "#ea580c",
        alertText: `There is a ${prob}% probability of active landslide blockages in the road connecting ${roadName}. Immediate action: Highway is blocked. Divert immediately to designated alternate bypass routes.`,
        isDanger: false,
      };
    } else if (stability === "MARGINAL" || sevBand === "MODERATE" || (fos != null && fos < 1.3)) {
      return {
        badge: "🟡 PREPARE & MONITOR",
        color: "#d97706",
        alertText: `There is a ${prob}% probability of a landslide in the road connecting ${roadName}. Action: Stay on high alert, prepare emergency go-bags, and avoid travel near steep hill cuts.`,
        isDanger: false,
      };
    }
    return {
      badge: "🟢 SAFE CONDITION",
      color: "#16a34a",
      alertText: `Landslide risk is low (${prob}% probability) along the road connecting ${roadName}. Road open; proceed with caution during rain.`,
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
      {/* Interactive Location Picking Active Banner */}
      {isPickingLocation && (
        <div className="sim-map-picking-banner">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="pulse-danger-dot" style={{ background: "#8b5cf6", boxShadow: "0 0 0 5px rgba(139, 92, 246, 0.4)" }} />
            <span>📍 <strong>Location Picker Active:</strong> Click anywhere on the map in Sikkim to inspect and place a custom monitoring station.</span>
          </div>
          <button
            type="button"
            className="sim-map-picking-cancel-btn"
            onClick={onCancelPickLocation}
            title="Cancel location selection"
          >
            ✕ Exit
          </button>
        </div>
      )}

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
        <div className="legend-item"><span className="legend-dot critical" /> Critical Hazard (Risk &gt; 75%)</div>
        <div className="legend-item"><span className="legend-dot major" /> Major Warning (Risk &gt; 50%)</div>
        <div className="legend-item"><span className="legend-dot moderate" /> Moderate Advisory (Risk &gt; 25%)</div>
        <div className="legend-item"><span className="legend-dot stable" /> Stable (Low Risk &lt; 10%)</div>
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

      <MapContainer
        center={center}
        zoom={9}
        style={{ height: "100%", width: "100%", cursor: isPickingLocation ? "crosshair" : "grab" }}
      >
        <MapClickHandler isPickingLocation={isPickingLocation} onMapClick={onMapClick} />
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
              {/* Custom Location Distinct Halo */}
              {data?.is_custom && (
                <CircleMarker
                  center={[params.latitude, params.longitude]}
                  radius={isSelected ? 38 : 26}
                  pathOptions={{
                    color: "#8b5cf6",
                    fillColor: "#c084fc",
                    fillOpacity: 0.3,
                    weight: 2.5,
                    dashArray: "4 3",
                  }}
                />
              )}

              <CircleMarker
                center={[params.latitude, params.longitude]}
                radius={isSelected ? 13 : 10}
                pathOptions={{
                  color: data?.is_custom ? "#8b5cf6" : "#FFFFFF",
                  fillColor: color,
                  fillOpacity: 0.95,
                  weight: data?.is_custom ? 3.5 : 3,
                }}
                eventHandlers={{ click: () => onSelectSite && onSelectSite(locationId) }}
              >
                <Popup>
                  <div style={{ fontSize: 13, lineHeight: 1.45, minWidth: 240 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <strong style={{ fontSize: 13.5 }}>{data?.is_custom ? "📍 " : "🏔️ "}{params.name}</strong>
                      {data?.is_custom && (
                        <span style={{ fontSize: 9.5, background: "#ede9fe", color: "#6d28d9", padding: "1px 6px", borderRadius: 10, fontWeight: 800 }}>
                          CUSTOM SITE
                        </span>
                      )}
                    </div>
                    <span style={{ color: "#64748b", fontSize: 11.5 }}>
                      {locationId} · Elevation {params.elevation_m}m · Slope {params.slope_deg || 38}°
                    </span><br />
                    <div style={{ marginTop: 6, fontSize: 12 }}>
                      <span>Landslide Risk: <strong style={{ color }}>{Math.round(data?.probability_percent ?? (data?.calibrated_probability != null ? data.calibrated_probability * 100 : 80))}% Probability ({stability})</strong></span><br />
                      <span>Connecting Highway: <strong>{data?.primary_road_corridor || data?.spatial_context?.primary_road_corridor || LOCATION_ROAD_NAMES[locationId] || params.name}</strong></span>
                    </div>
                    <div style={{ marginTop: 6, padding: "6px 8px", background: isUnstable ? "#fef2f2" : "#f8fafc", borderRadius: 6, border: `1px solid ${isUnstable ? "#fca5a5" : "#e2e8f0"}`, fontSize: 11.5, color: isUnstable ? "#991b1b" : "#334155" }}>
                      📢 There is a {Math.round(data?.probability_percent ?? 80)}% probability of a landslide in the road connecting {data?.primary_road_corridor || data?.spatial_context?.primary_road_corridor || LOCATION_ROAD_NAMES[locationId] || params.name}.
                      <div style={{ marginTop: 3, fontWeight: 600 }}>
                        👉 {isUnstable ? "Immediate action: Evacuate to relief shelters. Avoid road transit." : isMarginal ? "Action: Stay on high alert, prepare emergency go-bags." : "Status: Nominal landscape equilibrium."}
                      </div>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 10.5, color: "#94a3b8" }}>
                      Admin Geotechnical Telemetry: FoS {fos != null ? fos.toFixed(2) : "—"} · Severity {sevBand}
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
