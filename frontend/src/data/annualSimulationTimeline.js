// High-Impact Monsoon Crisis Simulation Engine for North Sikkim (June to October)
// Covers the 5 critical high-risk landslide months (153 Days: June 1 to October 31).
// Sequences staggered critical failure events across ALL monitored regions one by one for judge demonstrations.

export const TOTAL_SIMULATION_DAYS = 153;

export const MONSOON_MONTHS = [
  { name: "June", days: 30, offset: 0, tag: "Monsoon Onset 🌧️" },
  { name: "July", days: 31, offset: 30, tag: "Peak Cloudbursts ⚡" },
  { name: "August", days: 31, offset: 61, tag: "High Saturation ⚡" },
  { name: "September", days: 30, offset: 92, tag: "Late Deluge & Debris ⛈️" },
  { name: "October", days: 31, offset: 122, tag: "Post-Monsoon Seepage 🍂" },
];

export function getCalendarDate(dayOfYear) {
  const day = Math.max(1, Math.min(TOTAL_SIMULATION_DAYS, dayOfYear));

  for (let i = 0; i < MONSOON_MONTHS.length; i++) {
    const m = MONSOON_MONTHS[i];
    if (day <= m.offset + m.days) {
      const dayOfMonth = day - m.offset;
      return {
        monthIndex: i,
        monthName: m.name,
        day: dayOfMonth,
        dateString: `${m.name} ${dayOfMonth}, 2026`,
        dayOfYear: day,
        totalDays: TOTAL_SIMULATION_DAYS,
      };
    }
  }

  return {
    monthIndex: 4,
    monthName: "October",
    day: 31,
    dateString: "October 31, 2026",
    dayOfYear: TOTAL_SIMULATION_DAYS,
    totalDays: TOTAL_SIMULATION_DAYS,
  };
}

export function getSeason(dayOfYear) {
  const day = Math.max(1, Math.min(TOTAL_SIMULATION_DAYS, dayOfYear));

  if (day <= 25) {
    return {
      name: "Monsoon Onset Surge",
      icon: "🌧️",
      desc: "Moisture convergence ascending Teesta gorge, rapid saturation rise across high-altitude cut-slopes",
    };
  }
  if (day <= 55) {
    return {
      name: "Peak Monsoon Cloudburst Deluge",
      icon: "⚡",
      desc: "Violent convective storms, extreme pore-water pressure spikes, acute rotational slip hazards",
    };
  }
  if (day <= 90) {
    return {
      name: "High-Saturation River Flood Phase",
      icon: "⛈️",
      desc: "Continuous regolith saturation, high river stage toe scour, multiple valley road breaches",
    };
  }
  if (day <= 125) {
    return {
      name: "Late-Monsoon High Runoff & Debris",
      icon: "🌊",
      desc: "Severe mountain torrent scour, rock-debris flows, and active highway corridor washouts",
    };
  }
  return {
    name: "Post-Monsoon Hydrostatic Seepage",
    icon: "🍂",
    desc: "Delayed groundwater pressure dissipation, clearing weather, gradual slope stabilization recovery",
  };
}

export function round(val, decimals = 1) {
  const f = Math.pow(10, decimals);
  return Math.round(val * f) / f;
}

// Topographic physics evaluation from DEM geometry: slope = arctan(dz / run)
export function evaluateSlopeFromDEM(crestElevation, toeElevation, horizontalRun) {
  const deltaZ = Math.max(0, crestElevation - toeElevation);
  const run = Math.max(1, horizontalRun);
  const slopeRad = Math.atan2(deltaZ, run);
  return round(slopeRad * (180 / Math.PI), 1);
}

/**
 * Generates daily simulation telemetry for all 6 regions across June-October (153 days).
 * Staggered failure sequence allows judges to observe each region experiencing severe hazard,
 * triggering emergency broadcasts, blocking highways, and recovering in turn:
 *
 * 1. Days 18 - 24  (June 18-24):   LOC03 (Lachung Corridor - SH-1) [Pre-Monsoon Avalanche]
 * 2. Days 42 - 48  (July 12-18):   LOC01 (Dikchu Teesta Valley - NH-10) [Cloudburst Slope Collapse]
 * 3. Days 58 - 63  (July 28-Aug 2): LOC04 (Chungthang-Lachen Cut - SH-2) [Bedrock Planar Slide]
 * 4. Days 75 - 82  (Aug 14-21):    LOC02 (Chungthang Hydel Cut - SH-1/2) [Catastrophic Toe Scour]
 * 5. Days 98 - 104 (Sept 6-12):    LOC05 (Rangpo Teesta Slope - NH-10 S) [Riverbank Scour Slump]
 * 6. Days 116 - 122 (Sept 24-30):  LOC06 (Mangan Ridge Cut - NH-10 Pass) [Cumulative Saturation Slip]
 * 7. Days 128 - 135 (Oct 6-13):    Custom Locations / Delayed Seepage Hazard
 * 8. Days 136 - 153 (Oct 14-31):   Stabilization & Recovery back to safe Green equilibrium across all corridors
 */
export function getDailySimulationState(dayOfYear, customSites = {}) {
  const day = Math.max(1, Math.min(TOTAL_SIMULATION_DAYS, dayOfYear));
  const dateInfo = getCalendarDate(day);
  const seasonInfo = getSeason(day);

  // -------------------------------------------------------------------------
  // 1. LOC01: Dikchu Teesta Valley Left Slope (NH-10)
  // PEAK HAZARD: July 12 - July 18 (Days 42 - 48)
  // -------------------------------------------------------------------------
  let loc01_rain1h = 2.5;
  let loc01_rain24h = 18.0;
  let loc01_sat = 0.42;
  let loc01_fos = 1.48;
  let loc01_prob = 14.0;
  let loc01_sev = "MINOR";
  let loc01_state = "STABLE";
  let loc01_status = "Stable Limit Equilibrium";
  let loc01_blocked = false;

  if (day >= 36 && day <= 41) {
    // Cloudburst approach
    loc01_rain1h = 12.0;
    loc01_rain24h = 88.0;
    loc01_sat = 0.68;
    loc01_fos = 1.24;
    loc01_prob = 42.0;
    loc01_sev = "MODERATE";
    loc01_state = "MARGINAL";
    loc01_status = "Pore Pressure Saturation Rising";
  } else if (day >= 42 && day <= 48) {
    // CRITICAL CLOUDBURST COLLAPSE (RED)
    const peak = day === 44 || day === 45;
    loc01_rain1h = peak ? 44.0 : 28.0;
    loc01_rain24h = peak ? 285.0 : 175.0;
    loc01_sat = peak ? 0.94 : 0.85;
    loc01_fos = peak ? 0.81 : 0.92;
    loc01_prob = peak ? 93.5 : 81.0;
    loc01_sev = "CATASTROPHIC_POTENTIAL";
    loc01_state = "UNSTABLE";
    loc01_status = "🚨 CRITICAL ROTATIONAL FAILURE ACTIVE";
    loc01_blocked = true;
  } else if (day >= 49 && day <= 53) {
    // RECOVERY
    const prog = (day - 48) / 5;
    loc01_rain1h = 6.0 * (1 - prog);
    loc01_rain24h = 32.0 * (1 - prog);
    loc01_sat = 0.80 - prog * 0.40;
    loc01_fos = 0.98 + prog * 0.48;
    loc01_prob = 75.0 * (1 - prog) + 12.0;
    loc01_sev = loc01_fos >= 1.3 ? "MINOR" : "MODERATE";
    loc01_state = loc01_fos >= 1.3 ? "STABLE" : "MARGINAL";
    loc01_status = loc01_fos >= 1.3 ? "✅ Recovered to Stable Equilibrium" : "Post-Slide Debris Removal";
    loc01_blocked = false;
  }

  // -------------------------------------------------------------------------
  // 2. LOC02: Chungthang Hydel Cut & Valley Junction (SH-1 / SH-2)
  // PEAK HAZARD: August 14 - August 21 (Days 75 - 82)
  // -------------------------------------------------------------------------
  let loc02_rain1h = 3.0;
  let loc02_rain24h = 22.0;
  let loc02_sat = 0.48;
  let loc02_fos = 1.45;
  let loc02_prob = 15.0;
  let loc02_sev = "MINOR";
  let loc02_state = "STABLE";
  let loc02_status = "Stable Valley Junction";
  let loc02_blocked = false;

  if (day >= 68 && day <= 74) {
    loc02_rain1h = 14.0;
    loc02_rain24h = 110.0;
    loc02_sat = 0.72;
    loc02_fos = 1.22;
    loc02_prob = 46.0;
    loc02_sev = "MODERATE";
    loc02_state = "MARGINAL";
    loc02_status = "High River Stage & Toe Erosion";
  } else if (day >= 75 && day <= 82) {
    // CATASTROPHIC FLOOD TOE SCOUR & BREACH (RED)
    const peak = day === 78 || day === 79;
    loc02_rain1h = peak ? 52.0 : 34.0;
    loc02_rain24h = peak ? 330.0 : 210.0;
    loc02_sat = peak ? 0.96 : 0.88;
    loc02_fos = peak ? 0.79 : 0.89;
    loc02_prob = peak ? 95.0 : 83.0;
    loc02_sev = "CATASTROPHIC_POTENTIAL";
    loc02_state = "UNSTABLE";
    loc02_status = "🚨 CATASTROPHIC TOE SCOUR BREACH";
    loc02_blocked = true;
  } else if (day >= 83 && day <= 88) {
    const prog = (day - 82) / 6;
    loc02_rain1h = 8.0 * (1 - prog);
    loc02_rain24h = 35.0 * (1 - prog);
    loc02_sat = 0.85 - prog * 0.42;
    loc02_fos = 0.92 + prog * 0.52;
    loc02_prob = 78.0 * (1 - prog) + 14.0;
    loc02_sev = loc02_fos >= 1.3 ? "MINOR" : "MODERATE";
    loc02_state = loc02_fos >= 1.3 ? "STABLE" : "MARGINAL";
    loc02_status = loc02_fos >= 1.3 ? "✅ Recovered to Stable Equilibrium" : "Flood Scour Repair";
    loc02_blocked = false;
  }

  // -------------------------------------------------------------------------
  // 3. LOC03: Lachung River Road Corridor (SH-1 Bhim Nala)
  // PEAK HAZARD: June 18 - June 24 (Days 18 - 24)
  // -------------------------------------------------------------------------
  let loc03_rain1h = 1.8;
  let loc03_rain24h = 14.0;
  let loc03_sat = 0.38;
  let loc03_fos = 1.62;
  let loc03_prob = 8.0;
  let loc03_sev = "MINOR";
  let loc03_state = "STABLE";
  let loc03_status = "Stable Alpine Corridor";
  let loc03_blocked = false;

  if (day >= 12 && day <= 17) {
    loc03_rain1h = 9.0;
    loc03_rain24h = 65.0;
    loc03_sat = 0.62;
    loc03_fos = 1.28;
    loc03_prob = 36.0;
    loc03_sev = "MODERATE";
    loc03_state = "MARGINAL";
    loc03_status = "Snowmelt Runoff Infiltration";
  } else if (day >= 18 && day <= 24) {
    // PRE-MONSOON SQUALL & ROCK-DEBRIS AVALANCHE (RED)
    const peak = day === 20 || day === 21;
    loc03_rain1h = peak ? 34.0 : 22.0;
    loc03_rain24h = peak ? 195.0 : 135.0;
    loc03_sat = peak ? 0.88 : 0.80;
    loc03_fos = peak ? 0.86 : 0.94;
    loc03_prob = peak ? 86.5 : 74.0;
    loc03_sev = "MAJOR";
    loc03_state = "UNSTABLE";
    loc03_status = "🚨 ROCK-DEBRIS AVALANCHE ACTIVE";
    loc03_blocked = true;
  } else if (day >= 25 && day <= 28) {
    const prog = (day - 24) / 4;
    loc03_rain1h = 4.0 * (1 - prog);
    loc03_rain24h = 20.0 * (1 - prog);
    loc03_sat = 0.75 - prog * 0.40;
    loc03_fos = 0.98 + prog * 0.58;
    loc03_prob = 65.0 * (1 - prog) + 9.0;
    loc03_sev = loc03_fos >= 1.3 ? "MINOR" : "MODERATE";
    loc03_state = loc03_fos >= 1.3 ? "STABLE" : "MARGINAL";
    loc03_status = loc03_fos >= 1.3 ? "✅ Recovered to Stable Equilibrium" : "Debris Bulldozing";
    loc03_blocked = false;
  }

  // -------------------------------------------------------------------------
  // 4. LOC04: Chungthang-Lachen Highway Cut (SH-2)
  // PEAK HAZARD: July 28 - August 02 (Days 58 - 63)
  // -------------------------------------------------------------------------
  let loc04_rain1h = 2.0;
  let loc04_rain24h = 16.0;
  let loc04_sat = 0.40;
  let loc04_fos = 1.50;
  let loc04_prob = 12.0;
  let loc04_sev = "MINOR";
  let loc04_state = "STABLE";
  let loc04_status = "Stable High Gorge Cut";
  let loc04_blocked = false;

  if (day >= 53 && day <= 57) {
    loc04_rain1h = 11.0;
    loc04_rain24h = 82.0;
    loc04_sat = 0.65;
    loc04_fos = 1.25;
    loc04_prob = 39.0;
    loc04_sev = "MODERATE";
    loc04_state = "MARGINAL";
    loc04_status = "High Joint Water Pressure";
  } else if (day >= 58 && day <= 63) {
    // LATE JULY PLANAR BEDROCK COLLAPSE (RED)
    const peak = day === 60 || day === 61;
    loc04_rain1h = peak ? 38.0 : 25.0;
    loc04_rain24h = peak ? 225.0 : 155.0;
    loc04_sat = peak ? 0.90 : 0.82;
    loc04_fos = peak ? 0.84 : 0.93;
    loc04_prob = peak ? 88.0 : 76.0;
    loc04_sev = "MAJOR";
    loc04_state = "UNSTABLE";
    loc04_status = "🚨 PLANAR BEDROCK SLIDE OCCURRED";
    loc04_blocked = true;
  } else if (day >= 64 && day <= 67) {
    const prog = (day - 63) / 4;
    loc04_rain1h = 5.0 * (1 - prog);
    loc04_rain24h = 24.0 * (1 - prog);
    loc04_sat = 0.78 - prog * 0.40;
    loc04_fos = 0.96 + prog * 0.52;
    loc04_prob = 68.0 * (1 - prog) + 11.0;
    loc04_sev = loc04_fos >= 1.3 ? "MINOR" : "MODERATE";
    loc04_state = loc04_fos >= 1.3 ? "STABLE" : "MARGINAL";
    loc04_status = loc04_fos >= 1.3 ? "✅ Recovered to Stable Equilibrium" : "Clearing Lachen Road";
    loc04_blocked = false;
  }

  // -------------------------------------------------------------------------
  // 5. LOC05: Rangpo Teesta River Slope (NH-10 South Corridor)
  // PEAK HAZARD: September 06 - September 12 (Days 98 - 104)
  // -------------------------------------------------------------------------
  let loc05_rain1h = 2.2;
  let loc05_rain24h = 18.0;
  let loc05_sat = 0.44;
  let loc05_fos = 1.55;
  let loc05_prob = 10.0;
  let loc05_sev = "MINOR";
  let loc05_state = "STABLE";
  let loc05_status = "Stable Riverbank";
  let loc05_blocked = false;

  if (day >= 93 && day <= 97) {
    loc05_rain1h = 10.5;
    loc05_rain24h = 75.0;
    loc05_sat = 0.66;
    loc05_fos = 1.24;
    loc05_prob = 38.0;
    loc05_sev = "MODERATE";
    loc05_state = "MARGINAL";
    loc05_status = "Riverbank Water Table Surcharge";
  } else if (day >= 98 && day <= 104) {
    // SEPTEMBER RIVERBANK SCOUR SLUMP (RED)
    const peak = day === 100 || day === 101;
    loc05_rain1h = peak ? 30.0 : 20.0;
    loc05_rain24h = peak ? 185.0 : 130.0;
    loc05_sat = peak ? 0.89 : 0.80;
    loc05_fos = peak ? 0.87 : 0.95;
    loc05_prob = peak ? 82.0 : 72.0;
    loc05_sev = "MAJOR";
    loc05_state = "UNSTABLE";
    loc05_status = "🚨 EMBANKMENT SLUMP & ROAD WASHOUT";
    loc05_blocked = true;
  } else if (day >= 105 && day <= 108) {
    const prog = (day - 104) / 4;
    loc05_rain1h = 4.0 * (1 - prog);
    loc05_rain24h = 22.0 * (1 - prog);
    loc05_sat = 0.74 - prog * 0.35;
    loc05_fos = 0.98 + prog * 0.54;
    loc05_prob = 62.0 * (1 - prog) + 10.0;
    loc05_sev = loc05_fos >= 1.3 ? "MINOR" : "MODERATE";
    loc05_state = loc05_fos >= 1.3 ? "STABLE" : "MARGINAL";
    loc05_status = loc05_fos >= 1.3 ? "✅ Recovered to Stable Equilibrium" : "Embankment Restabilization";
    loc05_blocked = false;
  }

  // -------------------------------------------------------------------------
  // 6. LOC06: Mangan Ridge Highway Cut (NH-10 Pass)
  // PEAK HAZARD: September 24 - September 30 (Days 116 - 122)
  // -------------------------------------------------------------------------
  let loc06_rain1h = 2.0;
  let loc06_rain24h = 15.0;
  let loc06_sat = 0.42;
  let loc06_fos = 1.52;
  let loc06_prob = 11.0;
  let loc06_sev = "MINOR";
  let loc06_state = "STABLE";
  let loc06_status = "Stable Ridge Face";
  let loc06_blocked = false;

  if (day >= 111 && day <= 115) {
    loc06_rain1h = 11.5;
    loc06_rain24h = 80.0;
    loc06_sat = 0.67;
    loc06_fos = 1.23;
    loc06_prob = 40.0;
    loc06_sev = "MODERATE";
    loc06_state = "MARGINAL";
    loc06_status = "Cumulative Saturation Surcharge";
  } else if (day >= 116 && day <= 122) {
    // LATE SEPTEMBER ROTATIONAL EMBANKMENT FAILURE (RED)
    const peak = day === 118 || day === 119;
    loc06_rain1h = peak ? 35.0 : 23.0;
    loc06_rain24h = peak ? 215.0 : 145.0;
    loc06_sat = peak ? 0.91 : 0.81;
    loc06_fos = peak ? 0.85 : 0.94;
    loc06_prob = peak ? 87.0 : 75.0;
    loc06_sev = "MAJOR";
    loc06_state = "UNSTABLE";
    loc06_status = "🚨 ROTATIONAL RIDGE CUT FAILURE";
    loc06_blocked = true;
  } else if (day >= 123 && day <= 127) {
    const prog = (day - 122) / 5;
    loc06_rain1h = 4.0 * (1 - prog);
    loc06_rain24h = 20.0 * (1 - prog);
    loc06_sat = 0.76 - prog * 0.38;
    loc06_fos = 0.97 + prog * 0.52;
    loc06_prob = 66.0 * (1 - prog) + 11.0;
    loc06_sev = loc06_fos >= 1.3 ? "MINOR" : "MODERATE";
    loc06_state = loc06_fos >= 1.3 ? "STABLE" : "MARGINAL";
    loc06_status = loc06_fos >= 1.3 ? "✅ Recovered to Stable Equilibrium" : "Retaining Wall Reinforcement";
    loc06_blocked = false;
  }

  // -------------------------------------------------------------------------
  // 7. Dynamic evaluation for user-added Custom Locations (Days 128 - 135 Seepage Peak)
  // -------------------------------------------------------------------------
  const evaluatedCustom = {};
  if (customSites && typeof customSites === "object") {
    Object.entries(customSites).forEach(([cId, cSite]) => {
      let c_rain1h = 1.5;
      let c_rain24h = 12.0;
      let c_sat = 0.38;
      let c_fos = 1.48;
      let c_prob = 12.0;
      let c_sev = "MINOR";
      let c_state = "STABLE";
      let c_status = "Stable Custom Slope";
      let c_blocked = false;

      if (day >= 128 && day <= 135) {
        // Post-monsoon delayed seepage failure for custom site
        const peak = day === 131 || day === 132;
        c_rain1h = peak ? 28.0 : 16.0;
        c_rain24h = peak ? 175.0 : 115.0;
        c_sat = peak ? 0.88 : 0.78;
        c_fos = peak ? 0.88 : 0.96;
        c_prob = peak ? 83.0 : 71.0;
        c_sev = "MAJOR";
        c_state = "UNSTABLE";
        c_status = "🚨 DELAYED SEEPAGE INSTABILITY OCCURRED";
        c_blocked = true;
      } else if (day > 135) {
        c_fos = 1.52;
        c_prob = 8.0;
        c_status = "✅ Autumn Drainage Recovered";
      }

      evaluatedCustom[cId] = {
        ...cSite,
        rainfall_1h_mm: round(c_rain1h, 1),
        rainfall_24h_mm: round(c_rain24h, 1),
        initial_saturation_0_1: round(c_sat, 2),
        factor_of_safety: round(c_fos, 2),
        calibrated_probability: round(c_prob / 100, 3),
        probability_percent: round(c_prob, 1),
        stability_state: c_state,
        severity_band: c_sev,
        statusText: c_status,
        roadBlocked: c_blocked,
      };
    });
  }

  // Topographic DEM Cross-Section Geometry
  const loc01_slope = evaluateSlopeFromDEM(1915, 1780, 200);
  const loc02_slope = evaluateSlopeFromDEM(1560, 1420, 161);
  const loc03_slope = evaluateSlopeFromDEM(2772, 2650, 240);
  const loc04_slope = evaluateSlopeFromDEM(2050, 1910, 145);
  const loc05_slope = evaluateSlopeFromDEM(650, 580, 175);
  const loc06_slope = evaluateSlopeFromDEM(1380, 1220, 165);

  return {
    dayOfYear: day,
    dateInfo,
    seasonInfo,
    regions: {
      LOC01: {
        location_id: "LOC01",
        name: "Chungthang Confluence Hub",
        elevation_m: 1780,
        dem_crest_elevation_m: 1915,
        dem_toe_elevation_m: 1780,
        dem_horizontal_run_m: 200,
        dem_delta_z_m: 135,
        slope_deg: loc01_slope,
        rainfall_1h_mm: round(loc01_rain1h, 1),
        rainfall_24h_mm: round(loc01_rain24h, 1),
        initial_saturation_0_1: round(loc01_sat, 2),
        factor_of_safety: round(loc01_fos, 2),
        calibrated_probability: round(loc01_prob / 100, 3),
        probability_percent: round(loc01_prob, 1),
        stability_state: loc01_state,
        severity_band: loc01_sev,
        statusText: loc01_status,
        roadBlocked: loc01_blocked,
        latitude: 27.6040,
        longitude: 88.6460,
      },
      LOC02: {
        location_id: "LOC02",
        name: "Mangan District Ridge Cut",
        elevation_m: 1420,
        dem_crest_elevation_m: 1560,
        dem_toe_elevation_m: 1420,
        dem_horizontal_run_m: 161,
        dem_delta_z_m: 140,
        slope_deg: loc02_slope,
        rainfall_1h_mm: round(loc02_rain1h, 1),
        rainfall_24h_mm: round(loc02_rain24h, 1),
        initial_saturation_0_1: round(loc02_sat, 2),
        factor_of_safety: round(loc02_fos, 2),
        calibrated_probability: round(loc02_prob / 100, 3),
        probability_percent: round(loc02_prob, 1),
        stability_state: loc02_state,
        severity_band: loc02_sev,
        statusText: loc02_status,
        roadBlocked: loc02_blocked,
        latitude: 27.5050,
        longitude: 88.5280,
      },
      LOC03: {
        location_id: "LOC03",
        name: "Lachung River Road Corridor (Bhim Nala)",
        elevation_m: 2650,
        dem_crest_elevation_m: 2772,
        dem_toe_elevation_m: 2650,
        dem_horizontal_run_m: 240,
        dem_delta_z_m: 122,
        slope_deg: loc03_slope,
        rainfall_1h_mm: round(loc03_rain1h, 1),
        rainfall_24h_mm: round(loc03_rain24h, 1),
        initial_saturation_0_1: round(loc03_sat, 2),
        factor_of_safety: round(loc03_fos, 2),
        calibrated_probability: round(loc03_prob / 100, 3),
        probability_percent: round(loc03_prob, 1),
        stability_state: loc03_state,
        severity_band: loc03_sev,
        statusText: loc03_status,
        roadBlocked: loc03_blocked,
        latitude: 27.6980,
        longitude: 88.7460,
      },
      LOC04: {
        location_id: "LOC04",
        name: "Lachen Alpine Gorge Cut",
        elevation_m: 2050,
        dem_crest_elevation_m: 2200,
        dem_toe_elevation_m: 2050,
        dem_horizontal_run_m: 155,
        dem_delta_z_m: 150,
        slope_deg: loc04_slope,
        rainfall_1h_mm: round(loc04_rain1h, 1),
        rainfall_24h_mm: round(loc04_rain24h, 1),
        initial_saturation_0_1: round(loc04_sat, 2),
        factor_of_safety: round(loc04_fos, 2),
        calibrated_probability: round(loc04_prob / 100, 3),
        probability_percent: round(loc04_prob, 1),
        stability_state: loc04_state,
        severity_band: loc04_sev,
        statusText: loc04_status,
        roadBlocked: loc04_blocked,
        latitude: 27.7260,
        longitude: 88.5520,
      },
      LOC05: {
        location_id: "LOC05",
        name: "Rangpo Teesta River Slope",
        elevation_m: 650,
        dem_crest_elevation_m: 720,
        dem_toe_elevation_m: 650,
        dem_horizontal_run_m: 175,
        dem_delta_z_m: 70,
        slope_deg: loc05_slope,
        rainfall_1h_mm: round(loc05_rain1h, 1),
        rainfall_24h_mm: round(loc05_rain24h, 1),
        initial_saturation_0_1: round(loc05_sat, 2),
        factor_of_safety: round(loc05_fos, 2),
        calibrated_probability: round(loc05_prob / 100, 3),
        probability_percent: round(loc05_prob, 1),
        stability_state: loc05_state,
        severity_band: loc05_sev,
        statusText: loc05_status,
        roadBlocked: loc05_blocked,
        latitude: 27.1750,
        longitude: 88.5180,
      },
      LOC06: {
        location_id: "LOC06",
        name: "Gangtok-Nathula Pass Sector",
        elevation_m: 3100,
        dem_crest_elevation_m: 3260,
        dem_toe_elevation_m: 3100,
        dem_horizontal_run_m: 165,
        dem_delta_z_m: 160,
        slope_deg: loc06_slope,
        rainfall_1h_mm: round(loc06_rain1h, 1),
        rainfall_24h_mm: round(loc06_rain24h, 1),
        initial_saturation_0_1: round(loc06_sat, 2),
        factor_of_safety: round(loc06_fos, 2),
        calibrated_probability: round(loc06_prob / 100, 3),
        probability_percent: round(loc06_prob, 1),
        stability_state: loc06_state,
        severity_band: loc06_sev,
        statusText: loc06_status,
        roadBlocked: loc06_blocked,
        latitude: 27.3750,
        longitude: 88.6550,
      },
      ...evaluatedCustom,
    },
  };
}
