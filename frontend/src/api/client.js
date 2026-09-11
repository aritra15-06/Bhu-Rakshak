const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  getLocations: () => request("/locations"),
  predict: (locationId) => request("/predict", { method: "POST", body: JSON.stringify({ location_id: locationId }) }),
  simulate: (locationId, overrides, reset = false) =>
    request("/simulate", { method: "POST", body: JSON.stringify({ location_id: locationId, overrides, reset }) }),
  batchSimulate: (overridesByLocation = {}, resetAll = false) =>
    request("/simulate/batch", { method: "POST", body: JSON.stringify({ overrides_by_location: overridesByLocation, reset_all: resetAll }) }),
  simulateEphemeral: (overridesByLocation = {}, scenarioId = null) =>
    request("/simulate/ephemeral", { method: "POST", body: JSON.stringify({ overrides_by_location: overridesByLocation, scenario_id: scenarioId }) }),
  runScenario: (scenarioId) =>
    request("/simulate/scenario", { method: "POST", body: JSON.stringify({ scenario_id: scenarioId }) }),
  getImpact: (locationId, bufferM = 500) => request(`/impact/${locationId}?buffer_m=${bufferM}`),
  getContacts: () => request("/contacts"),
  addContact: (contact) => request("/contacts", { method: "POST", body: JSON.stringify(contact) }),
  deleteContact: (id) => request(`/contacts/${id}`, { method: "DELETE" }),
  sendAlerts: (locationId, dryRun) =>
    request("/alerts/send", { method: "POST", body: JSON.stringify({ location_id: locationId, dry_run: dryRun }) }),
  startTraining: () => request("/train/start", { method: "POST" }),
  getTrainingStatus: (jobId) => request(`/train/status/${jobId}`),
  health: () => request("/health"),
  getSmsSettings: () => request("/settings/sms"),
  saveSmsSettings: (settings) => request("/settings/sms", { method: "POST", body: JSON.stringify(settings) }),
  testTelegram: (botToken, chatId) =>
    request("/settings/test-telegram", { method: "POST", body: JSON.stringify({ bot_token: botToken, chat_id: chatId }) }),
};
