-- Bhu-Rakshak Impact Engine — reference PostGIS query
--
-- This file is a REFERENCE/INTERFACE STUB, not this module's deliverable.
-- Per the JSON contract section 18, impact/affected-entities computation
-- is explicitly downstream of the ML/physics prediction service and must
-- NOT be embedded in the raw prediction JSON. Per the Work Distribution
-- doc, the Impact Engine (real PostGIS ST_Intersects query, scoped to the
-- 2-3 demo pilot zones) is owned by Sanit.
--
-- This query is provided so Sanit's Impact Engine has a concrete,
-- version-compatible starting point that joins cleanly against this
-- service's location_id and hazard geometry conventions. Extend/replace
-- freely — the ML/physics side does not depend on this file at all.

-- Assumes:
--   hazard_cells(location_id TEXT PRIMARY KEY, geom GEOMETRY(Polygon, 4326))
--     -- one polygon per analysis cell, matching the location_id values
--     -- used by the prediction service (LOC01, LOC02, LOC03 for the demo)
--   villages(id, name, population, geom GEOMETRY(Point, 4326))
--   roads(id, name, road_class, geom GEOMETRY(LineString, 4326))

-- Affected villages for a given hazard cell (scoped to the demo pilot zones only)
SELECT
    v.id,
    v.name,
    v.population,
    hc.location_id AS hazard_location_id
FROM villages v
JOIN hazard_cells hc
    ON ST_Intersects(v.geom, ST_Buffer(hc.geom::geography, 500)::geometry)  -- 500m buffer, MVP default
WHERE hc.location_id = :location_id;  -- e.g. 'LOC01' — bind from the raw prediction JSON's location.location_id

-- Affected roads for a given hazard cell
SELECT
    r.id,
    r.name,
    r.road_class,
    hc.location_id AS hazard_location_id
FROM roads r
JOIN hazard_cells hc
    ON ST_Intersects(r.geom, ST_Buffer(hc.geom::geography, 500)::geometry)
WHERE hc.location_id = :location_id;

-- Notes for Sanit:
--   * hazard_cells.geom should be populated from the same location_id /
--     lat-lon used in demo/pilot_locations.json for the 2-3 demo sites —
--     do not invent separate IDs, or the dashboard/action engine join
--     breaks (per Work Distribution doc "Open Item").
--   * decision_threshold and calibrated_probability live in the raw
--     prediction JSON (ml_output.calibrated_probability); this SQL layer
--     should not re-derive hazard, only map a hazard-flagged location_id
--     to affected entities.
--   * Scope to the 2-3 pre-loaded demo zones for the prototype, per the
--     Work Distribution doc's explicit cut ("Full-scale/live PostGIS
--     coverage beyond the 2-3 pre-loaded demo zones").
