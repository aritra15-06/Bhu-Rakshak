import { useState, useEffect } from "react";
import { api } from "../api/client";

export function SettingsModal({ isOpen, onClose }) {
  const [provider, setProvider] = useState("telegram");
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [fast2smsApiKey, setFast2smsApiKey] = useState("");
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [fromNumber, setFromNumber] = useState("");
  const [isConfigured, setIsConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    if (isOpen) {
      api.getSmsSettings().then((data) => {
        setProvider(data.active_provider || "telegram");
        setTelegramBotToken(data.telegram_bot_token || "");
        setTelegramChatId(data.telegram_chat_id || "");
        setFast2smsApiKey(data.fast2sms_api_key || "");
        setAccountSid(data.account_sid || "");
        setFromNumber(data.from_number || "");
        setIsConfigured(data.is_configured);
        if (data.has_token) {
          setAuthToken("••••••••••••••••");
        }
      }).catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setStatusMsg("");
    try {
      const payload = {
        active_provider: provider,
        telegram_bot_token: telegramBotToken,
        telegram_chat_id: telegramChatId,
        fast2sms_api_key: fast2smsApiKey,
        account_sid: accountSid,
        from_number: fromNumber,
      };
      if (authToken && !authToken.includes("••••")) {
        payload.auth_token = authToken;
      }
      const res = await api.saveSmsSettings(payload);
      if (res.saved) {
        setIsConfigured(res.is_configured);
        setStatusMsg("✅ Settings saved successfully! Alert channel is active.");
      } else {
        setStatusMsg("❌ Error saving settings: " + (res.error || "Unknown"));
      }
    } catch (err) {
      setStatusMsg("❌ Error: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTestTelegram() {
    setTesting(true);
    setStatusMsg("");
    try {
      const res = await api.testTelegram(telegramBotToken, telegramChatId);
      if (res.success) {
        setStatusMsg("✅ Test alert successfully sent to Telegram! Check your phone/desktop.");
      } else {
        setStatusMsg("❌ Telegram error: " + (res.error || "Failed to send test alert"));
      }
    } catch (err) {
      setStatusMsg("❌ Test error: " + err.message);
    } finally {
      setTesting(false);
    }
  }

  async function handleTestFast2sms() {
    setTesting(true);
    setStatusMsg("");
    try {
      const res = await api.testFast2sms(fast2smsApiKey);
      if (res.success && res.wallet?.success) {
        setStatusMsg(`✅ Fast2SMS API Key Verified! Wallet Balance: Rs. ${res.wallet.wallet_inr} (${res.wallet.sms_count} SMS available)`);
      } else {
        setStatusMsg("❌ Fast2SMS: " + (res.message || res.error || "Failed to verify Fast2SMS key"));
      }
    } catch (err) {
      setStatusMsg("❌ Fast2SMS Test Error: " + err.message);
    } finally {
      setTesting(false);
    }
  }


  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(15, 23, 42, 0.65)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
    }}>
      <div style={{
        background: "#ffffff",
        width: "92%",
        maxWidth: 600,
        borderRadius: 14,
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        overflow: "hidden",
      }}>
        <div style={{
          padding: "16px 22px",
          background: "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <h3 style={{ margin: 0, fontSize: "1.1rem", display: "flex", alignItems: "center", gap: 8, color: "#0f172a" }}>
            ⚙️ Alert & Notification Channels (100% Free Options)
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: "1.2rem",
              cursor: "pointer",
              color: "#64748b",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 22, maxHeight: "80vh", overflowY: "auto" }}>

          {/* Provider Selection Tabs */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#475569", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Select Active Alert Provider:
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              <button
                type="button"
                onClick={() => setProvider("telegram")}
                style={{
                  padding: "10px 8px",
                  borderRadius: 8,
                  border: provider === "telegram" ? "2px solid #2563eb" : "1px solid #cbd5e1",
                  background: provider === "telegram" ? "#eff6ff" : "#ffffff",
                  cursor: "pointer",
                  textAlign: "center",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: provider === "telegram" ? "#1d4ed8" : "#475569",
                }}
              >
                📱 Telegram Bot
                <div style={{ fontSize: "0.7rem", color: "#16a34a", fontWeight: 700, marginTop: 2 }}>
                  100% Free Forever
                </div>
              </button>

              <button
                type="button"
                onClick={() => setProvider("simulated")}
                style={{
                  padding: "10px 8px",
                  borderRadius: 8,
                  border: provider === "simulated" ? "2px solid #2563eb" : "1px solid #cbd5e1",
                  background: provider === "simulated" ? "#eff6ff" : "#ffffff",
                  cursor: "pointer",
                  textAlign: "center",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: provider === "simulated" ? "#1d4ed8" : "#475569",
                }}
              >
                📢 Cell Broadcast
                <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: 2 }}>
                  Local Simulation
                </div>
              </button>

              <button
                type="button"
                onClick={() => setProvider("fast2sms")}
                style={{
                  padding: "10px 8px",
                  borderRadius: 8,
                  border: provider === "fast2sms" ? "2px solid #2563eb" : "1px solid #cbd5e1",
                  background: provider === "fast2sms" ? "#eff6ff" : "#ffffff",
                  cursor: "pointer",
                  textAlign: "center",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: provider === "fast2sms" ? "#1d4ed8" : "#475569",
                }}
              >
                ⚡ Fast2SMS
                <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: 2 }}>
                  Free Indian SMS
                </div>
              </button>
            </div>
          </div>

          <form onSubmit={handleSave}>
            {/* Telegram Provider View */}
            {provider === "telegram" && (
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: "0.82rem", color: "#334155", marginBottom: 12, lineHeight: 1.45 }}>
                  💡 <b>Quick 60-Second Setup (Zero Cost, Instant Mobile Push)</b>:
                  <ol style={{ margin: "6px 0 0 16px", padding: 0 }}>
                    <li>Open Telegram, search for <b>@BotFather</b> and type <code>/newbot</code> to get your <b>Bot Token</b>.</li>
                    <li>Message <b>@userinfobot</b> to view your <b>Chat ID</b>, then start your bot.</li>
                  </ol>
                </div>

                <div className="form-field" style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>
                    Telegram Bot Token
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                    value={telegramBotToken}
                    onChange={(e) => setTelegramBotToken(e.target.value)}
                    style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                  />
                </div>

                <div className="form-field" style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>
                    Telegram Chat ID / Channel ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 987654321"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleTestTelegram}
                  disabled={testing || !telegramBotToken || !telegramChatId}
                  style={{
                    padding: "6px 12px",
                    background: "#e0e7ff",
                    color: "#3730a3",
                    border: "1px solid #c7d2fe",
                    borderRadius: 6,
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {testing ? "Sending Test Alert…" : "📲 Send Real Test Push to Phone"}
                </button>
              </div>
            )}

            {/* Fast2SMS Provider View */}
            {provider === "fast2sms" && (
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: "0.82rem", color: "#334155", marginBottom: 10 }}>
                  Fast2SMS developer route for sending alerts to Indian phone numbers.
                </div>
                <div className="form-field" style={{ marginBottom: 10 }}>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>
                    Fast2SMS API Authorization Key
                  </label>
                  <input
                    type="text"
                    placeholder="Paste Fast2SMS API key"
                    value={fast2smsApiKey}
                    onChange={(e) => setFast2smsApiKey(e.target.value)}
                    style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                  />
                </div>
                <button
                  type="button"
                  className="btn"
                  style={{ width: "100%", background: "#f1f5f9", borderColor: "#cbd5e1", color: "#1e293b", fontSize: "0.85rem", fontWeight: 600 }}
                  onClick={handleTestFast2sms}
                  disabled={testing || !fast2smsApiKey}
                >
                  {testing ? "Checking Key & Wallet…" : "🔍 Verify Key & Check Wallet Balance"}
                </button>
                <div style={{ fontSize: "0.76rem", color: "#64748b", marginTop: 8, lineHeight: 1.4 }}>
                  ℹ️ <em>Fast2SMS Note:</em> Free accounts receive welcome credits on signup. Fast2SMS requires completing one minimum Rs. 100 transaction on fast2sms.com to activate the developer API route for sending live SMS.
                </div>
              </div>
            )}

            {/* Simulated Cell Broadcast View */}
            {provider === "simulated" && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: "0.85rem", color: "#166534", fontWeight: 600 }}>
                  ✅ Fully Offline Free Broadcast Mode Active
                </div>
                <div style={{ fontSize: "0.8rem", color: "#15803d", marginTop: 4 }}>
                  Dispatches real-time landslide warnings to all field observers, regional command towers, and the live UI dispatch console with 0ms latency. No third-party accounts or phone network needed.
                </div>
              </div>
            )}

            {statusMsg && (
              <div style={{
                marginBottom: 14,
                padding: "8px 12px",
                borderRadius: 6,
                fontSize: "0.85rem",
                background: statusMsg.startsWith("✅") ? "#f0fdf4" : "#fef2f2",
                color: statusMsg.startsWith("✅") ? "#166534" : "#991b1b",
              }}>
                {statusMsg}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                className="btn"
                onClick={onClose}
                style={{ padding: "8px 16px" }}
              >
                Close
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
                style={{ padding: "8px 16px" }}
              >
                {saving ? "Saving…" : "Save Alert Settings"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
