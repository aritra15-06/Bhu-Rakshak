import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { api } from "../api/client";

const SiteStateContext = createContext(null);

export function SiteStateProvider({ children }) {
  // One entry per location_id -- the actual "per-site independent,
  // monitored simultaneously" mechanism from the implementation plan.
  const [sites, setSites] = useState({});
  const [selectedSite, setSelectedSite] = useState("LOC02");
  const [loading, setLoading] = useState(true);
  const [activeScenario, setActiveScenario] = useState(null);
  const [toastAlert, setToastAlert] = useState(null);
  const [showPopulation, setShowPopulation] = useState(false);

  const refreshSite = useCallback(async (locationId) => {
    const result = await api.predict(locationId);
    setSites((prev) => ({ ...prev, [locationId]: { ...prev[locationId], ...result } }));
    return result;
  }, []);

  const applyOverrides = useCallback(async (locationId, overrides) => {
    const result = await api.simulate(locationId, overrides, false);
    setSites((prev) => ({ ...prev, [locationId]: { ...prev[locationId], ...result } }));
    return result;
  }, []);

  const resetSite = useCallback(async (locationId) => {
    const result = await api.simulate(locationId, {}, true);
    setSites((prev) => ({ ...prev, [locationId]: { ...prev[locationId], ...result } }));
    return result;
  }, []);

  const runScenario = useCallback(async (scenarioId) => {
    try {
      const res = await api.runScenario(scenarioId);
      if (res.sites) {
        setSites(res.sites);
      }
      setActiveScenario(scenarioId);
      if (res.toast) {
        setToastAlert(res.toast);
      }
      return res;
    } catch (err) {
      console.error("Failed to run scenario", err);
    }
  }, []);

  const batchSimulate = useCallback(async (overridesBySite = {}, resetAll = false) => {
    try {
      const res = await api.batchSimulate(overridesBySite, resetAll);
      if (res.sites) {
        setSites(res.sites);
      }
      return res;
    } catch (err) {
      console.error("Failed to batch simulate", err);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { locations } = await api.getLocations();
        const results = {};
        for (const loc of locations) {
          try {
            const pred = await api.predict(loc.location_id);
            results[loc.location_id] = pred;
          } catch (e) {
            console.error(`initial predict failed for ${loc.location_id}`, e);
          }
        }
        setSites(results);
        if (locations.length > 0 && !selectedSite) {
          setSelectedSite(locations[0].location_id);
        }
      } catch (err) {
        console.error("Failed to load initial site data from API:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const value = {
    sites,
    selectedSite,
    setSelectedSite,
    refreshSite,
    applyOverrides,
    resetSite,
    loading,
    activeScenario,
    runScenario,
    batchSimulate,
    toastAlert,
    setToastAlert,
    showPopulation,
    setShowPopulation,
  };
  return <SiteStateContext.Provider value={value}>{children}</SiteStateContext.Provider>;
}

export function useSiteState() {
  const ctx = useContext(SiteStateContext);
  if (!ctx) throw new Error("useSiteState must be used within SiteStateProvider");
  return ctx;
}
