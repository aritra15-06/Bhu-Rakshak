// 1-Year (365 Days) Accelerated Meteorological & Geotechnical Timeline for North Sikkim
// Designed to replay an entire annual cycle within 60 seconds (~6 days per second).

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function getCalendarDate(dayOfYear) {
  let remaining = Math.max(1, Math.min(365, dayOfYear));
  for (let m = 0; m < 12; m++) {
    if (remaining <= DAYS_IN_MONTH[m]) {
      return {
        monthIndex: m,
        monthName: MONTH_NAMES[m],
        day: remaining,
        dateString: `${MONTH_NAMES[m]} ${remaining}, 2026`,
      };
    }
    remaining -= DAYS_IN_MONTH[m];
  }
  return { monthIndex: 11, monthName: "December", day: 31, dateString: "December 31, 2026" };
}

export function getSeason(dayOfYear) {
  if (dayOfYear <= 75) return { name: "Winter Dry Season", icon: "❄️", desc: "Low precipitation, ground frozen or dry, high slope equilibrium" };
  if (dayOfYear <= 140) return { name: "Pre-Monsoon & Snowmelt", icon: "🌱", desc: "Isolated convective showers, soil thawing, nominal stability" };
  if (dayOfYear <= 180) return { name: "Southwest Monsoon Onset", icon: "🌧️", desc: "Moisture bands advancing up Teesta gorge, rising saturation" };
  if (dayOfYear <= 235) return { name: "Peak Monsoon Deluge", icon: "⚡", desc: "Severe localized cloudbursts, high pore-pressure spikes, acute hazard" };
  if (dayOfYear <= 270) return { name: "Late Monsoon High-Runoff", icon: "⛈️", desc: "Saturated regolith, high-altitude debris flows along valley cuts" };
  if (dayOfYear <= 325) return { name: "Post-Monsoon Autumn", icon: "🍂", desc: "Clear skies, rapid soil drainage, slope stabilization recovery" };
  return { name: "Winter Freeze", icon: "❄️", desc: "Sub-zero temperatures, stable dry Himalayan conditions" };
}

export function round(val, decimals = 1) {
  const f = Math.pow(10, decimals);
  return Math.round(val * f) / f;
}

// Physics calculation function: Computes slope angle from raw DEM topographic measurements
// slope_deg = arctan((crest - toe) / run)
export function evaluateSlopeFromDEM(crestElevation, toeElevation, horizontalRun) {
  const deltaZ = Math.max(0, crestElevation - toeElevation);
  const run = Math.max(1, horizontalRun);
  const slopeRad = Math.atan2(deltaZ, run);
  return round(slopeRad * (180 / Math.PI), 1);
}

// Generates the daily state for each of the 3 primary pilot regions
export function getDailySimulationState(dayOfYear) {
  const day = Math.max(1, Math.min(365, dayOfYear));
  const dateInfo = getCalendarDate(day);
  const seasonInfo = getSeason(day);

  // --- Region 1: Chungthang Corridor (LOC01) ---
  // Peak Event: Early July Cloudburst (Days 185 - 189)
  let loc01_rain1h = 0.5;
  let loc01_rain24h = 4.0;
  let loc01_sat = 0.22;
  let loc01_fos = 1.54;
  let loc01_prob = 7.0;
  let loc01_sevBand = "MINOR";
  let loc01_state = "STABLE";
  let loc01_statusText = "Stable Limit Equilibrium";
  let loc01_roadBlocked = false;

  if (day >= 155 && day < 184) {
    // Monsoon build-up
    loc01_rain1h = 6.0 + ((day - 155) / 30) * 8.0;
    loc01_rain24h = 45.0 + ((day - 155) / 30) * 50.0;
    loc01_sat = 0.45 + ((day - 155) / 30) * 0.20;
    loc01_fos = 1.35 - ((day - 155) / 30) * 0.15;
    loc01_prob = 22.0 + ((day - 155) / 30) * 20.0;
    loc01_state = loc01_fos < 1.3 ? "MARGINAL" : "STABLE";
    loc01_sevBand = loc01_fos < 1.3 ? "MODERATE" : "MINOR";
  } else if (day >= 184 && day <= 189) {
    // CLOUDBURST DISASTER & LANDSLIDE (RED)
    const peak = day === 186 || day === 187;
    loc01_rain1h = peak ? 36.5 : 24.0;
    loc01_rain24h = peak ? 245.0 : 160.0;
    loc01_sat = peak ? 0.89 : 0.80;
    loc01_fos = peak ? 0.82 : 0.94;
    loc01_prob = peak ? 92.5 : 78.0;
    loc01_sevBand = "CATASTROPHIC_POTENTIAL";
    loc01_state = "UNSTABLE";
    loc01_statusText = "🚨 CRITICAL LANDSLIDE OCCURRED";
    loc01_roadBlocked = true;
  } else if (day >= 190 && day <= 194) {
    // POST-SLIDE RECOVERY CYCLE (transitioning back to Green)
    const prog = (day - 189) / 5; // 0 to 1
    loc01_rain1h = 8.0 * (1 - prog);
    loc01_rain24h = 40.0 * (1 - prog);
    loc01_sat = 0.75 - prog * 0.45;
    loc01_fos = 0.98 + prog * 0.50; // climbs to ~1.48
    loc01_prob = 60.0 * (1 - prog) + 12.0;
    loc01_state = loc01_fos >= 1.3 ? "STABLE" : "MARGINAL";
    loc01_sevBand = loc01_fos >= 1.3 ? "MINOR" : "MODERATE";
    loc01_statusText = loc01_fos >= 1.3 ? "✅ Recovered to Standard Landscape" : "Drainage & Clearing";
    loc01_roadBlocked = false;
  } else if (day > 194 && day <= 240) {
    // Moderate late-monsoon baseline
    loc01_rain1h = 4.0;
    loc01_rain24h = 25.0;
    loc01_sat = 0.35;
    loc01_fos = 1.48;
    loc01_prob = 14.0;
  }

  // --- Region 2: Mangan-Dikchu Corridor (LOC02) ---
  // Peak Event: Mid-August Torrential Front (Days 219 - 224)
  let loc02_rain1h = 0.4;
  let loc02_rain24h = 3.5;
  let loc02_sat = 0.25;
  let loc02_fos = 1.48;
  let loc02_prob = 9.0;
  let loc02_sevBand = "MINOR";
  let loc02_state = "STABLE";
  let loc02_statusText = "Stable Limit Equilibrium";
  let loc02_roadBlocked = false;

  if (day >= 135 && day <= 145) {
    // Mild pre-monsoon shower warning
    loc02_rain1h = 7.5;
    loc02_rain24h = 48.0;
    loc02_sat = 0.48;
    loc02_fos = 1.26;
    loc02_prob = 38.0;
    loc02_state = "MARGINAL";
    loc02_sevBand = "MODERATE";
    loc02_statusText = "Pre-monsoon Embankment Soak";
  } else if (day >= 175 && day <= 218) {
    // Persistent monsoon moisture
    loc02_rain1h = 8.0;
    loc02_rain24h = 65.0;
    loc02_sat = 0.55;
    loc02_fos = 1.28;
    loc02_prob = 35.0;
    loc02_state = "MARGINAL";
    loc02_sevBand = "MODERATE";
  } else if (day >= 219 && day <= 224) {
    // AUGUST LANDSLIDE EVENT (RED)
    const peak = day === 221 || day === 222;
    loc02_rain1h = peak ? 31.0 : 22.0;
    loc02_rain24h = peak ? 210.0 : 150.0;
    loc02_sat = peak ? 0.88 : 0.78;
    loc02_fos = peak ? 0.85 : 0.95;
    loc02_prob = peak ? 89.0 : 75.0;
    loc02_sevBand = "MAJOR";
    loc02_state = "UNSTABLE";
    loc02_statusText = "🚨 MAJOR SLOPE COLLAPSE OCCURRED";
    loc02_roadBlocked = true;
  } else if (day >= 225 && day <= 229) {
    // RECOVERY BACK TO GREEN
    const prog = (day - 224) / 5;
    loc02_rain1h = 6.0 * (1 - prog);
    loc02_rain24h = 30.0 * (1 - prog);
    loc02_sat = 0.72 - prog * 0.42;
    loc02_fos = 0.98 + prog * 0.48; // back to ~1.46
    loc02_prob = 55.0 * (1 - prog) + 11.0;
    loc02_state = loc02_fos >= 1.3 ? "STABLE" : "MARGINAL";
    loc02_sevBand = loc02_fos >= 1.3 ? "MINOR" : "MODERATE";
    loc02_statusText = loc02_fos >= 1.3 ? "✅ Recovered to Standard Landscape" : "Sediment Settlement";
    loc02_roadBlocked = false;
  }

  // --- Region 3: Lachung Valley Sector (LOC03) ---
  // Peak Event: Early September Late-Monsoon Debris Wave (Days 247 - 252)
  let loc03_rain1h = 0.2;
  let loc03_rain24h = 2.0;
  let loc03_sat = 0.18;
  let loc03_fos = 1.68;
  let loc03_prob = 5.0;
  let loc03_sevBand = "MINOR";
  let loc03_state = "STABLE";
  let loc03_statusText = "Stable Alpine Valley";
  let loc03_roadBlocked = false;

  if (day >= 200 && day < 246) {
    // Saturated valley runoff
    loc03_rain1h = 5.0;
    loc03_rain24h = 35.0;
    loc03_sat = 0.42;
    loc03_fos = 1.42;
    loc03_prob = 18.0;
  } else if (day >= 246 && day <= 251) {
    // SEPTEMBER DEBRIS FLOW (RED)
    const peak = day === 248 || day === 249;
    loc03_rain1h = peak ? 27.0 : 19.0;
    loc03_rain24h = peak ? 180.0 : 130.0;
    loc03_sat = peak ? 0.86 : 0.77;
    loc03_fos = peak ? 0.89 : 0.96;
    loc03_prob = peak ? 86.0 : 72.0;
    loc03_sevBand = "MAJOR";
    loc03_state = "UNSTABLE";
    loc03_statusText = "🚨 DEBRIS AVALANCHE ACTIVE";
    loc03_roadBlocked = true;
  } else if (day >= 252 && day <= 256) {
    // RECOVERY BACK TO GREEN
    const prog = (day - 251) / 5;
    loc03_rain1h = 4.0 * (1 - prog);
    loc03_rain24h = 20.0 * (1 - prog);
    loc03_sat = 0.68 - prog * 0.45;
    loc03_fos = 1.05 + prog * 0.55; // back to ~1.60
    loc03_prob = 50.0 * (1 - prog) + 6.0;
    loc03_state = loc03_fos >= 1.3 ? "STABLE" : "MARGINAL";
    loc03_sevBand = loc03_fos >= 1.3 ? "MINOR" : "MODERATE";
    loc03_statusText = loc03_fos >= 1.3 ? "✅ Recovered to Standard Landscape" : "Alpine Drainage";
    loc03_roadBlocked = false;
  }

  // Topographic DEM Cross-Section Geometry (Simulated raw sensor & elevation point cloud)
  // Slope angle is NOT simulated directly; it is calculated dynamically by the physics engine:
  // slope = arctan((crest - toe) / run)
  const loc01_crest = 1915;
  const loc01_toe = 1780;
  const loc01_run = 200;
  const loc01_slope = evaluateSlopeFromDEM(loc01_crest, loc01_toe, loc01_run);

  const loc02_crest = 1560;
  const loc02_toe = 1420;
  const loc02_run = 161;
  const loc02_slope = evaluateSlopeFromDEM(loc02_crest, loc02_toe, loc02_run);

  const loc03_crest = 2772;
  const loc03_toe = 2650;
  const loc03_run = 240;
  const loc03_slope = evaluateSlopeFromDEM(loc03_crest, loc03_toe, loc03_run);

  return {
    dayOfYear: day,
    dateInfo,
    seasonInfo,
    regions: {
      LOC01: {
        location_id: "LOC01",
        name: "Chungthang Road Corridor",
        elevation_m: 1780,
        dem_crest_elevation_m: loc01_crest,
        dem_toe_elevation_m: loc01_toe,
        dem_horizontal_run_m: loc01_run,
        dem_delta_z_m: loc01_crest - loc01_toe,
        slope_deg: loc01_slope, // Calculated by physics engine from DEM geometry
        rainfall_1h_mm: round(loc01_rain1h, 1),
        rainfall_24h_mm: round(loc01_rain24h, 1),
        initial_saturation_0_1: round(loc01_sat, 2),
        factor_of_safety: round(loc01_fos, 2),
        calibrated_probability: round(loc01_prob / 100, 3),
        probability_percent: round(loc01_prob, 1),
        stability_state: loc01_state,
        severity_band: loc01_sevBand,
        statusText: loc01_statusText,
        roadBlocked: loc01_roadBlocked,
        latitude: 27.5990,
        longitude: 88.6483,
      },
      LOC02: {
        location_id: "LOC02",
        name: "Mangan-Dikchu Highway Sector",
        elevation_m: 1420,
        dem_crest_elevation_m: loc02_crest,
        dem_toe_elevation_m: loc02_toe,
        dem_horizontal_run_m: loc02_run,
        dem_delta_z_m: loc02_crest - loc02_toe,
        slope_deg: loc02_slope, // Calculated by physics engine from DEM geometry
        rainfall_1h_mm: round(loc02_rain1h, 1),
        rainfall_24h_mm: round(loc02_rain24h, 1),
        initial_saturation_0_1: round(loc02_sat, 2),
        factor_of_safety: round(loc02_fos, 2),
        calibrated_probability: round(loc02_prob / 100, 3),
        probability_percent: round(loc02_prob, 1),
        stability_state: loc02_state,
        severity_band: loc02_sevBand,
        statusText: loc02_statusText,
        roadBlocked: loc02_roadBlocked,
        latitude: 27.5100,
        longitude: 88.5300,
      },
      LOC03: {
        location_id: "LOC03",
        name: "Lachung Valley Road Sector",
        elevation_m: 2650,
        dem_crest_elevation_m: loc03_crest,
        dem_toe_elevation_m: loc03_toe,
        dem_horizontal_run_m: loc03_run,
        dem_delta_z_m: loc03_crest - loc03_toe,
        slope_deg: loc03_slope, // Calculated by physics engine from DEM geometry
        rainfall_1h_mm: round(loc03_rain1h, 1),
        rainfall_24h_mm: round(loc03_rain24h, 1),
        initial_saturation_0_1: round(loc03_sat, 2),
        factor_of_safety: round(loc03_fos, 2),
        calibrated_probability: round(loc03_prob / 100, 3),
        probability_percent: round(loc03_prob, 1),
        stability_state: loc03_state,
        severity_band: loc03_sevBand,
        statusText: loc03_statusText,
        roadBlocked: loc03_roadBlocked,
        latitude: 27.6900,
        longitude: 88.7450,
      },
    },
  };
}
