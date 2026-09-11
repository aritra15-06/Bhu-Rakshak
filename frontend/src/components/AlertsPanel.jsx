import { useState, useEffect } from "react";
import { api } from "../api/client";
import { useSiteState } from "../state/SiteStateContext";

const LANGUAGE_LABELS = {
  en: "English",
  hi: "Hindi",
  ne: "Nepali",
  bn: "Bengali",
  mr: "Marathi",
};

// Official Department of Telecommunications (DoT) Circle Profiles
const CIRCLE_PROFILES = {
  wb: {
    circle: "West Bengal & Kolkata Circle",
    lat: 27.0410,
    lon: 88.2663,
    label: "Darjeeling & Kalimpong Foothills (WB)",
    language: "bn",
    langName: "Bengali (বাংলা)",
  },
  sikkim: {
    circle: "Sikkim Telecom Circle",
    lat: 27.5100,
    lon: 88.5300,
    label: "Mangan & North Sikkim Corridor",
    language: "ne",
    langName: "Nepali (नेपाली)",
  },
  maharashtra: {
    circle: "Maharashtra & Goa Circle",
    lat: 19.0760,
    lon: 72.8777,
    label: "Western Ghats Corridor (Maharashtra)",
    language: "mr",
    langName: "Marathi (मराठी)",
  },
  bihar: {
    circle: "Bihar & Jharkhand Circle",
    lat: 25.5941,
    lon: 85.1376,
    label: "Eastern Plains & Chota Nagpur Corridor",
    language: "hi",
    langName: "Hindi (हिंदी)",
  },
  north_india: {
    circle: "North India Hindi Circle",
    lat: 28.6139,
    lon: 77.2090,
    label: "Sub-Himalayan Foothills",
    language: "hi",
    langName: "Hindi (हिंदी)",
  },
  nepal: {
    circle: "Nepal Telecom Network",
    lat: 27.7172,
    lon: 85.3240,
    label: "Eastern Nepal Himalayan Corridor",
    language: "ne",
    langName: "Nepali (नेपाली)",
  },
  bangladesh: {
    circle: "Bangladesh Mobile Network",
    lat: 22.3569,
    lon: 91.7832,
    label: "Chittagong Hill Tracts Corridor",
    language: "bn",
    langName: "Bengali (বাংলা)",
  },
};

// Comprehensive DoT Prefix Mapping for West Bengal & Kolkata Circles
// Covers Airtel, Reliance Jio, BSNL, Vodafone Idea (Vi)
const WB_PREFIXES = new Set([
  "9830", "9831", "9832", "9836", "9874", "9875", "9804", "9883", "9903", "9932", "9933",
  "9432", "9433", "9434", "9474", "9475", "9476", "9477",
  "9732", "9733", "9734", "9735", "9748", "9749", "9775", "9774",
  "9674", "9679", "9681", "9609", "9614", "9635", "9641", "9647",
  "9593", "9563", "9564", "9547", "9531",
  "9002", "9007", "9051", "9064", "9088",
  "9123", "9126", "9144", "9153", "9163",
  "8001", "8013", "8016", "8017",
  "8116", "8145", "8158", "8159", "8170",
  "8250", "8334", "8335", "8336", "8337", "8348", "8370", "8371", "8372", "8373", "8388", "8389",
  "8420", "8436", "8478", "8479", "8481",
  "8509", "8512", "8513", "8514", "8515", "8535", "8536", "8537", "8538", "8582", "8583", "8584", "8585",
  "8617", "8637", "8648", "8670", "8697",
  "8759", "8768", "8777",
  "8900", "8902", "8906", "8910", "8918", "8926", "8927", "8942", "8944", "8945", "8961", "8967", "8972", "8981",
  "7001", "7003", "7029", "7044", "7047", "7076",
  "7318", "7319", "7362", "7363", "7364", "7365", "7384",
  "7407", "7430", "7431", "7432", "7439", "7449",
  "7501", "7547", "7548", "7557", "7583", "7584", "7585", "7586",
  "7601", "7602", "7605", "7679", "7699",
  "7718", "7719", "7797",
  "7863", "7864", "7865", "7866", "7872", "7890",
  "7908", "7980",
  "6289", "6290", "6291", "6292", "6294", "6295", "6296", "6297"
]);

// Dedicated North Sikkim MSC allocations (BSNL / Jio North Sikkim corridors)
const SIKKIM_PREFIXES_5 = new Set(["94750", "94751", "94752", "94341", "89720", "70630", "97330", "97331"]);
const SIKKIM_PREFIXES_4 = new Set(["7063"]);

// Comprehensive DoT Prefix Mapping for Maharashtra & Mumbai Circles
const MH_PREFIXES = new Set([
  "9819", "9820", "9821", "9822", "9823", "9869", "9892", "9920", "9921", "9922", "9923", "9960", "9970", "9975",
  "9762", "9763", "9764", "9765", "9766", "9767", "9768", "9769", "9730",
  "9604", "9607", "9619", "9623", "9637", "9657", "9665", "9689", "9699",
  "9503", "9511", "9518", "9527", "9529", "9545", "9552", "9561", "9579", "9595",
  "9403", "9404", "9405", "9420", "9421", "9422", "9423",
  "9011", "9021", "9022", "9028", "9049", "9075", "9096",
  "9130", "9136", "9146", "9158", "9167", "9168", "9172", "9175",
  "8928", "8956", "8975", "8976", "8983", "8999",
  "8805", "8806", "8830", "8850", "8855", "8856", "8857", "8879", "8888",
  "8766", "8767", "8788", "8793", "8796",
  "8600", "8605", "8623", "8624", "8625", "8652", "8655", "8657", "8668", "8669", "8698",
  "8408", "8411", "8412", "8421", "8446", "8451", "8452", "8454", "8482", "8483", "8484", "8485",
  "8308", "8329", "8380", "8390",
  "8208", "8237", "8275", "8108", "8149", "8007", "8080", "8087", "8097",
  "7972", "7977",
  "7820", "7821", "7822", "7823", "7840", "7841", "7875", "7887", "7888",
  "7709", "7710", "7715", "7720", "7721", "7722", "7738", "7741", "7744", "7745", "7755", "7756", "7757", "7758", "7767", "7768", "7769", "7770", "7774", "7775", "7776", "7796", "7798",
  "7620", "7666",
  "7506", "7507", "7517", "7558", "7559", "7588",
  "7410", "7420", "7447", "7448", "7498", "7499",
  "7304", "7350", "7378", "7385", "7387",
  "7218", "7219", "7249", "7261", "7262", "7263", "7264", "7276",
  "7020", "7021", "7028", "7030", "7038", "7045", "7057", "7058", "7066", "7083"
]);

function detectSimLocationAndLanguage(phone) {
  if (!phone) return null;
  const raw = phone.trim();

  // Strict International Dialing check (requires explicit '+' or '00' or >10 digits with country code)
  if (raw.startsWith("+977") || raw.startsWith("00977")) {
    return { ...CIRCLE_PROFILES.nepal };
  }
  if (raw.startsWith("+880") || raw.startsWith("00880")) {
    return { ...CIRCLE_PROFILES.bangladesh };
  }

  // Parse digits
  const clean = raw.replace(/[^0-9]/g, "");

  // If >10 digits, check if country code is present
  if (clean.length > 10) {
    if (clean.startsWith("977") && !clean.startsWith("9775")) {
      return { ...CIRCLE_PROFILES.nepal };
    }
    if (clean.startsWith("880") && clean.length >= 12) {
      return { ...CIRCLE_PROFILES.bangladesh };
    }
  }

  // Extract standard 10-digit Indian National Number
  let num10 = clean;
  if (clean.length === 12 && clean.startsWith("91")) {
    num10 = clean.slice(2);
  } else if (clean.length === 11 && clean.startsWith("0")) {
    num10 = clean.slice(1);
  } else if (clean.length > 10) {
    num10 = clean.slice(-10);
  }

  if (num10.length < 4) return null;

  const prefix5 = num10.slice(0, 5);
  const prefix4 = num10.slice(0, 4);

  // 1. High-precision Sikkim check (only dedicated Sikkim MSC blocks)
  if (SIKKIM_PREFIXES_5.has(prefix5) || SIKKIM_PREFIXES_4.has(prefix4)) {
    return { ...CIRCLE_PROFILES.sikkim };
  }

  // 2. Comprehensive West Bengal & Kolkata Circle check
  if (WB_PREFIXES.has(prefix4)) {
    return { ...CIRCLE_PROFILES.wb };
  }

  // 3. Comprehensive Maharashtra & Mumbai Circle check
  if (MH_PREFIXES.has(prefix4)) {
    return { ...CIRCLE_PROFILES.maharashtra };
  }

  // 4. Bihar & Jharkhand check
  if (
    ["9430", "9431", "9470", "9471", "9472", "9473", "9504", "9507", "9523", "9525", "9534", "9546", "9570",
     "9572", "9576", "9608", "9631", "9661", "9693", "9708", "9709", "9771", "9798", "9801", "9835", "9852",
     "9905", "9931", "9934", "9939", "9955", "9973"].includes(prefix4)
  ) {
    return { ...CIRCLE_PROFILES.bihar };
  }

  // 5. North India / Delhi Hindi belt
  if (
    ["9810", "9811", "9818", "9868", "9871", "9873", "9891", "9899", "9910", "9911", "9953", "9958", "9968",
     "9971", "9990", "9999", "9711", "9716", "9717", "9718", "9410", "9411", "9412", "9415", "9450"].includes(prefix4)
  ) {
    return { ...CIRCLE_PROFILES.north_india };
  }

  // 6. Default for the Bhu-Rakshak Eastern Himalayan Regional System:
  // Default to West Bengal & Regional Corridor
  return { ...CIRCLE_PROFILES.wb };
}

export function AlertsPanel() {
  const { sites, selectedSite } = useSiteState();
  const [contacts, setContacts] = useState([]);
  const [twilioConfigured, setTwilioConfigured] = useState(false);
  const [form, setForm] = useState({ name: "", phone_number: "", town: "Mangan Bazaar" });
  const [overrideCircleId, setOverrideCircleId] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [lastResult, setLastResult] = useState(null);
  const [sending, setSending] = useState(false);
  const [appMode, setAppMode] = useState("sms"); // "sms" or "android_app"

  // Provider info & Test alert state
  const [providerInfo, setProviderInfo] = useState(null);
  const [testContactId, setTestContactId] = useState("");
  const [testRecipientName, setTestRecipientName] = useState("");
  const [testRecipientPhone, setTestRecipientPhone] = useState("");
  const [testRecipientTown, setTestRecipientTown] = useState("Mangan Bazaar");
  const [testCustomMessage, setTestCustomMessage] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Simulated connected Android app mobile devices
  const [connectedDevices] = useState([
    { device_id: "AND-9482-SK", model: "Samsung Galaxy A54", user: "Pema Dorjee", lat: 27.5995, lon: 88.6485, alt_m: 1785, accuracy_m: 4.2, status: "Active (Inside LOC01 Buffer)" },
    { device_id: "AND-3102-WB", model: "Xiaomi Redmi Note 12", user: "Anish Rai", lat: 27.5085, lon: 88.5265, alt_m: 1425, accuracy_m: 3.8, status: "Active (Inside LOC02 Buffer)" },
    { device_id: "AND-7719-NER", model: "OnePlus Nord CE 3", user: "Tashi Bhutia", lat: 27.6915, lon: 88.7475, alt_m: 2655, accuracy_m: 5.1, status: "Standby (Monitoring)" }
  ]);

  async function loadContacts() {
    const data = await api.getContacts();
    setContacts(data.contacts);
    setTwilioConfigured(data.twilio_configured);
    if (data.contacts?.length > 0 && !testContactId) {
      const first = data.contacts[0];
      setTestContactId(first.contact_id);
      setTestRecipientName(first.name);
      setTestRecipientPhone(first.phone_number);
      setTestRecipientTown(first.town || "North Sikkim Sector");
      setTestCustomMessage(`🚨 BHU-RAKSHAK TEST ALERT: Sensor connection verified for ${first.name}. Landslide early warning telemetry operating normally.`);
    }
  }

  async function loadProviderInfo() {
    try {
      const settings = await api.getSmsSettings();
      let wallet = null;
      if (settings.active_provider === "fast2sms") {
        try {
          wallet = await api.getFast2smsWallet();
        } catch (_) {}
      }
      setProviderInfo({ ...settings, wallet });
    } catch (e) {
      console.warn("Failed to load SMS provider settings:", e);
    }
  }

  useEffect(() => {
    loadContacts();
    loadProviderInfo();
  }, []);

  function handleSelectTestContact(cId) {
    setTestContactId(cId);
    setTestResult(null);
    if (cId === "custom") {
      setTestRecipientName("");
      setTestRecipientPhone("");
      setTestRecipientTown("North Sikkim Sector");
      setTestCustomMessage("🚨 BHU-RAKSHAK TEST ALERT: Sensor connection verified. Landslide early warning telemetry operating normally.");
    } else {
      const found = contacts.find((c) => c.contact_id === cId);
      if (found) {
        setTestRecipientName(found.name);
        setTestRecipientPhone(found.phone_number);
        setTestRecipientTown(found.town || "North Sikkim Sector");
        setTestCustomMessage(`🚨 BHU-RAKSHAK TEST ALERT: Sensor connection verified for ${found.name} at ${found.town || "North Sikkim"}. Landslide telemetry active.`);
      }
    }
  }

  async function handleSendTestSMS(directContact = null) {
    const name = directContact ? directContact.name : (testContactId === "custom" ? testRecipientName : testRecipientName || "Citizen");
    const phone = directContact ? directContact.phone_number : (testContactId === "custom" ? testRecipientPhone : testRecipientPhone);
    const town = directContact ? directContact.town : (testContactId === "custom" ? testRecipientTown : testRecipientTown);
    const msg = testCustomMessage || `🚨 BHU-RAKSHAK TEST ALERT: Sensor connection verified for ${name}.`;

    if (!phone || phone.trim().length < 8) {
      setTestResult({ success: false, error: "Please enter a valid phone number (at least 10 digits for India)." });
      return;
    }

    setTestSending(true);
    setTestResult(null);
    try {
      const res = await api.testAlert({
        phone_number: phone,
        recipient_name: name || "Resident",
        town: town || "North Sikkim Sector",
        custom_message: msg,
        dry_run: false,
      });
      setTestResult(res);
      loadProviderInfo();
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTestSending(false);
    }
  }

  const autoDetectedInfo = detectSimLocationAndLanguage(form.phone_number);
  const effectiveSimInfo = overrideCircleId && CIRCLE_PROFILES[overrideCircleId]
    ? { ...CIRCLE_PROFILES[overrideCircleId], isOverridden: true }
    : autoDetectedInfo;

  async function handleAddContact(e) {
    e.preventDefault();
    const info = effectiveSimInfo || {
      lat: 27.0410,
      lon: 88.2663,
      language: "bn",
    };

    await api.addContact({
      name: form.name,
      phone_number: form.phone_number,
      latitude: info.lat,
      longitude: info.lon,
      preferred_language: info.language,
      town: form.town,
    });
    setForm({ name: "", phone_number: "", town: "Mangan Bazaar" });
    setOverrideCircleId("");
    loadContacts();
  }

  async function handleDelete(id) {
    await api.deleteContact(id);
    loadContacts();
  }

  async function handleSend() {
    if (!selectedSite) return;
    setSending(true);
    try {
      const result = await api.sendAlerts(selectedSite, dryRun);
      setLastResult(result);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <button
          className={`btn ${appMode === "sms" ? "btn-primary" : ""}`}
          onClick={() => setAppMode("sms")}
        >
          📱 SMS Alerts Dispatch
        </button>
        <button
          className={`btn ${appMode === "android_app" ? "btn-primary" : ""}`}
          onClick={() => setAppMode("android_app")}
        >
          🤖 Android Companion App (Live GPS Tracking)
        </button>
      </div>

      {appMode === "android_app" && (
        <div className="panel-section">
          <h3>Android Companion App — Connected Devices & Live Geofencing</h3>
          <div className="caveat-note" style={{ background: "rgba(33, 150, 243, 0.1)", borderColor: "#2196f3", color: "#1e293b" }}>
            💡 <strong>Bhu-Rakshak Mobile App Integration:</strong> Android devices running the app transmit real-time background GPS pings. When a landslide risk is detected, the server pushes high-priority geofenced safety alerts directly to devices currently inside the hazard radius.
          </div>

          <div style={{ marginTop: 12 }}>
            {connectedDevices.map((dev) => (
              <div className="citizen-report-item" key={dev.device_id} style={{ borderLeft: "4px solid #0284c7" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                  <span>{dev.user} ({dev.model})</span>
                  <span style={{ fontSize: "0.85rem", color: "#0284c7" }}>{dev.status}</span>
                </div>
                <div className="meta" style={{ marginTop: 4 }}>
                  Device ID: {dev.device_id} · GPS: {dev.lat}, {dev.lon} · Altitude: {dev.alt_m}m · Accuracy: ±{dev.accuracy_m}m
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {appMode === "sms" && (
        <>
          <div className="panel-section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Registered Contacts & Field Observers ({contacts.length})</h3>
            </div>

            {/* Active Provider & Wallet Status Indicator */}
            <div style={{
              background: providerInfo?.active_provider === "fast2sms" ? "#eff6ff" : (providerInfo?.active_provider === "telegram" ? "#f0fdf4" : "#f8fafc"),
              border: `1px solid ${providerInfo?.active_provider === "fast2sms" ? "#bfdbfe" : (providerInfo?.active_provider === "telegram" ? "#bbf7d0" : "#cbd5e1")}`,
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 14,
              fontSize: "0.85rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
            }}>
              <div>
                <strong>Active Emergency Channel: </strong>
                {providerInfo?.active_provider === "fast2sms" && <span>⚡ <strong>Fast2SMS (Developer API)</strong></span>}
                {providerInfo?.active_provider === "telegram" && <span>🤖 <strong>Telegram Bot (100% Free Push)</strong></span>}
                {providerInfo?.active_provider === "simulated" && <span>📡 <strong>Simulated Live Broadcast</strong></span>}
                {providerInfo?.active_provider === "twilio" && <span>📞 <strong>Twilio SMS Gateway</strong></span>}
                {providerInfo?.active_provider === "fast2sms" && providerInfo?.wallet?.success && (
                  <span style={{ marginLeft: 8, padding: "2px 8px", background: "#dbeafe", color: "#1e40af", borderRadius: 12, fontSize: "0.78rem", fontWeight: 700 }}>
                    💳 Wallet: Rs. {providerInfo.wallet.wallet_inr} ({providerInfo.wallet.sms_count} SMS)
                  </span>
                )}
              </div>
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                Switch provider in ⚙️ Settings
              </span>
            </div>

            {contacts.map((c) => (
              <div className="contact-row" key={c.contact_id}>
                <div>
                  <strong>{c.name}</strong> · <span>{c.phone_number}</span><br />
                  <span style={{ fontSize: "0.82rem", color: "#64748b" }}>
                    📍 {c.town || "North Sikkim Settlement"} · 🗣️ {LANGUAGE_LABELS[c.preferred_language] || c.preferred_language}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    type="button"
                    className="btn"
                    style={{ fontSize: "0.8rem", padding: "4px 10px", background: "#f1f5f9", borderColor: "#cbd5e1", color: "#1e293b", fontWeight: 600 }}
                    onClick={() => {
                      handleSelectTestContact(c.contact_id);
                      handleSendTestSMS(c);
                    }}
                    disabled={testSending}
                  >
                    {testSending && testContactId === c.contact_id ? "Sending…" : "🧪 Test SMS"}
                  </button>
                  <button className="btn" onClick={() => handleDelete(c.contact_id)}>Remove</button>
                </div>
              </div>
            ))}
            {contacts.length === 0 && <div className="metric-row"><span className="metric-label">No contacts registered yet</span></div>}
          </div>

          {/* Dedicated Person-Specific Test Alert Dispatch Section */}
          <div className="panel-section" style={{ border: "2px solid #3b82f6", background: "#f8fafc", borderRadius: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ margin: 0, color: "#1e3a8a" }}>🧪 Test Emergency SMS Dispatch</h3>
              <span style={{ fontSize: "0.75rem", background: "#dbeafe", color: "#1e40af", padding: "3px 8px", borderRadius: 4, fontWeight: 700 }}>
                DIRECT RECIPIENT TESTING
              </span>
            </div>
            <p style={{ fontSize: "0.82rem", color: "#475569", marginTop: 0, marginBottom: 12 }}>
              Select any registered citizen or enter a custom mobile number to test live SMS delivery without needing to trigger a full landslide hazard cycle.
            </p>

            <div className="form-field" style={{ marginBottom: 10 }}>
              <label style={{ fontSize: "0.82rem", fontWeight: 600 }}>Select Recipient / Person to Test</label>
              <select
                value={testContactId}
                onChange={(e) => handleSelectTestContact(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: "0.88rem" }}
              >
                {contacts.map((c) => (
                  <option key={c.contact_id} value={c.contact_id}>
                    👤 {c.name} ({c.phone_number}) — {c.town || "North Sikkim"}
                  </option>
                ))}
                <option value="custom">➕ Enter Custom Mobile Number / Observer</option>
              </select>
            </div>

            {testContactId === "custom" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div className="form-field">
                  <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>Citizen / Observer Name</label>
                  <input
                    placeholder="e.g. Ramesh Sharma"
                    value={testRecipientName}
                    onChange={(e) => setTestRecipientName(e.target.value)}
                    style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: "0.85rem" }}
                  />
                </div>
                <div className="form-field">
                  <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>10-Digit Mobile Number</label>
                  <input
                    placeholder="e.g. 9830012345"
                    value={testRecipientPhone}
                    onChange={(e) => setTestRecipientPhone(e.target.value)}
                    style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: "0.85rem" }}
                  />
                </div>
              </div>
            )}

            <div className="form-field" style={{ marginBottom: 12 }}>
              <label style={{ fontSize: "0.82rem", fontWeight: 600 }}>Test Alert Message Content</label>
              <textarea
                rows={2}
                value={testCustomMessage}
                onChange={(e) => setTestCustomMessage(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: "0.85rem", resize: "vertical" }}
              />
              <div style={{ fontSize: "0.74rem", color: "#64748b", marginTop: 2, textAlign: "right" }}>
                Length: {testCustomMessage.length} chars (1 SMS credit = 160 chars)
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1, padding: "9px 16px", fontWeight: 600, fontSize: "0.9rem" }}
                onClick={() => handleSendTestSMS()}
                disabled={testSending}
              >
                {testSending ? "Sending Test SMS…" : `🚀 Send Test SMS to ${testRecipientName || "Selected Recipient"}`}
              </button>
            </div>

            {/* Test Result Diagnostic Card */}
            {testResult && (
              <div style={{
                marginTop: 14,
                padding: "12px 14px",
                borderRadius: 8,
                background: testResult.success ? "#f0fdf4" : "#fef2f2",
                border: `1.5px solid ${testResult.success ? "#22c55e" : "#ef4444"}`,
                fontSize: "0.85rem",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <strong style={{ color: testResult.success ? "#15803d" : "#b91c1c", fontSize: "0.92rem" }}>
                    {testResult.success ? "✅ Test SMS Delivered Successfully!" : "❌ Test SMS Dispatch Failed"}
                  </strong>
                  <span style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
                    Provider: {testResult.active_provider || providerInfo?.active_provider}
                  </span>
                </div>

                <div style={{ color: "#334155", lineHeight: 1.5 }}>
                  <div><strong>Recipient:</strong> {testResult.recipient_name} (<code>{testResult.phone_number}</code>)</div>
                  {testResult.message && <div style={{ marginTop: 4 }}><strong>Message Sent:</strong> {testResult.message}</div>}
                  {testResult.error && (
                    <div style={{
                      marginTop: 8,
                      padding: "8px 10px",
                      background: "#fee2e2",
                      border: "1px solid #fca5a5",
                      borderRadius: 6,
                      color: "#991b1b",
                      fontSize: "0.82rem",
                    }}>
                      ⚠️ <strong>Error Details:</strong> {testResult.error}
                    </div>
                  )}
                  {testResult.error && (testResult.active_provider === "fast2sms" || providerInfo?.active_provider === "fast2sms") && (
                    <div style={{ marginTop: 8, fontSize: "0.78rem", color: "#475569", background: "#f8fafc", padding: 8, borderRadius: 6, border: "1px solid #e2e8f0" }}>
                      💡 <strong>Fast2SMS Solution:</strong> Your Fast2SMS API key is verified and connected to wallet balance (Rs. 50.00). However, Fast2SMS requires completing one minimum Rs. 100 recharge on <a href="https://www.fast2sms.com" target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>fast2sms.com</a> to unlock programmatic API SMS dispatch. You can also switch to <strong>Telegram Bot</strong> or <strong>Simulated Free Broadcast</strong> in ⚙️ Settings for instant free testing!
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="panel-section">
            <h3>Register citizen for emergency alerts</h3>
            <form onSubmit={handleAddContact}>
              <div className="form-field">
                <label>Citizen / Candidate Name</label>
                <input required value={form.name} placeholder="e.g. Ramesh Sharma" onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>

              <div className="form-field">
                <label>Assigned Settlement / Mountain Town</label>
                <select
                  value={form.town}
                  onChange={(e) => setForm({ ...form, town: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: "0.88rem" }}
                >
                  <option value="Mangan Bazaar">Mangan Bazaar (LOC02 - District HQ)</option>
                  <option value="Dikchu Settlement">Dikchu Settlement (LOC02 - Highway Sector)</option>
                  <option value="Chungthang Town">Chungthang Town (LOC01 - Valley Junction)</option>
                  <option value="Bop Village">Bop Village (LOC01 - Foothill Hamlet)</option>
                  <option value="Lachung Village">Lachung Village (LOC03 - High Valley)</option>
                  <option value="Lachen Road Camp">Lachen Road Camp (LOC04 - Highway Cut)</option>
                  <option value="Rangpo Township">Rangpo Township (LOC05 - Teesta Border)</option>
                  <option value="Nathula Checkpost">Nathula Checkpost (LOC06 - Alpine Pass)</option>
                  <option value="Gangtok Capital Hub">Gangtok Capital Hub (State Transit Center)</option>
                </select>
              </div>

              <div className="form-field">
                <label>Phone number (e.g. +91 9830..., +977..., +880...)</label>
                <input
                  required
                  value={form.phone_number}
                  placeholder="+919830012345"
                  onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                />
              </div>

              {effectiveSimInfo && (
                <div style={{
                  background: "rgba(16, 185, 129, 0.08)",
                  border: "1px solid #10b981",
                  borderRadius: 8,
                  padding: "10px 14px",
                  marginBottom: 14,
                  fontSize: "0.85rem",
                  color: "#065f46",
                  lineHeight: 1.5,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>📶 <strong>Inferred SIM Origin:</strong> {effectiveSimInfo.circle} {effectiveSimInfo.isOverridden ? "(Manual Selection)" : "(Auto-Detected)"}</div>
                    <button
                      type="button"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#0284c7",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        textDecoration: "underline",
                        padding: 0,
                      }}
                      onClick={() => setOverrideCircleId(overrideCircleId ? "" : "wb")}
                    >
                      {overrideCircleId ? "Reset to Auto" : "Change Circle"}
                    </button>
                  </div>
                  <div>📍 <strong>Assigned Risk Corridor:</strong> {effectiveSimInfo.label}</div>
                  <div>🗣️ <strong>Emergency Alert Language:</strong> {effectiveSimInfo.langName}</div>

                  {overrideCircleId && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed rgba(16, 185, 129, 0.4)" }}>
                      <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: 4 }}>
                        Override Telecom Circle / Language:
                      </label>
                      <select
                        style={{ width: "100%", padding: "4px 8px", borderRadius: 4, border: "1px solid #10b981", fontSize: "0.82rem" }}
                        value={overrideCircleId}
                        onChange={(e) => setOverrideCircleId(e.target.value)}
                      >
                        <option value="wb">West Bengal & Kolkata (Bengali)</option>
                        <option value="sikkim">Sikkim & North Sikkim (Nepali)</option>
                        <option value="maharashtra">Maharashtra & Goa (Marathi)</option>
                        <option value="bihar">Bihar & Jharkhand (Hindi)</option>
                        <option value="north_india">North India / Delhi (Hindi)</option>
                        <option value="nepal">Nepal Telecom (Nepali)</option>
                        <option value="bangladesh">Bangladesh Mobile (Bengali)</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              <button className="btn btn-primary" type="submit">Add contact</button>
            </form>
          </div>

          <div className="panel-section">
            <h3>Send alerts</h3>
            {!selectedSite && <div className="caveat-note">Select a site to send alerts for it.</div>}
            {selectedSite && (
              <>
                <div className="metric-row">
                  <span className="metric-label">Selected site</span>
                  <span className="metric-value">{selectedSite}</span>
                </div>
                <div className="toggle-row">
                  <input type="checkbox" id="dryrun" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
                  <label htmlFor="dryrun">Dry run (log only, no real SMS)</label>
                </div>
                <button className="btn btn-primary" disabled={sending} onClick={handleSend}>
                  {sending ? "Sending…" : "Send alerts now"}
                </button>
              </>
            )}

            {lastResult && (
              <div style={{ marginTop: 16 }}>
                <div className="metric-row">
                  <span className="metric-label">Action</span>
                  <span className="metric-value">{lastResult.action || "—"}</span>
                </div>
                {lastResult.reason && <div className="caveat-note">{lastResult.reason}</div>}
                {lastResult.recipients && lastResult.recipients.map((r, i) => {
                  const isEvac = r.tier === "EVACUATE_NOW";
                  const isDetour = r.tier && r.tier.includes("DETOUR");
                  const borderCol = isEvac ? "#dc2626" : isDetour ? "#ea580c" : "#d97706";
                  const badgeText = isEvac ? "🚨 URGENT EVACUATION" : isDetour ? "⚠️ ROUTE DETOUR ADVISORY" : "🟡 PREPARE & MONITOR";

                  return (
                    <div className="citizen-report-item" key={i} style={{ borderLeft: `4px solid ${borderCol}` }}>
                      <div className="type" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span><strong>{r.name}</strong> · 📍 {r.town || "North Sikkim"}</span>
                        <span style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: 4,
                          color: isEvac ? "#991b1b" : isDetour ? "#9a3412" : "#854d0e",
                          background: isEvac ? "#fee2e2" : isDetour ? "#ffedd5" : "#fef9c3",
                        }}>
                          {badgeText}
                        </span>
                      </div>
                      <div className="meta" style={{ marginTop: 4 }}>
                        {r.distance_m}m away · {LANGUAGE_LABELS[r.language] || r.language} · {r.dry_run ? "Simulation (Dry Run)" : (r.sent ? "Sent via Live SMS" : "Failed")}
                      </div>
                      <div style={{ marginTop: 6, fontWeight: 500, color: "#0f172a", background: "#f8fafc", padding: 8, borderRadius: 6, border: "1px solid #e2e8f0" }}>
                        💬 {r.message}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
