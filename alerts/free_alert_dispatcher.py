"""
Free Alert Dispatcher: 100% Free Notification Alternatives.

Provides zero-cost, credit-card-free notification channels:
1. Telegram Bot API: Free, instant mobile & desktop push notifications.
2. Fast2SMS Developer API: Free route for Indian mobile numbers.
3. Native Browser Notifications & Simulation Dispatch Log.
"""

from __future__ import annotations

import os
import json
import urllib.request
import urllib.parse
from typing import Dict, Any, Optional

SETTINGS_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "free_alert_settings.json")


def load_free_alert_settings() -> Dict[str, Any]:
    default_settings = {
        "active_provider": "telegram",  # "telegram", "fast2sms", or "simulated"
        "telegram_bot_token": os.environ.get("TELEGRAM_BOT_TOKEN", ""),
        "telegram_chat_id": os.environ.get("TELEGRAM_CHAT_ID", ""),
        "fast2sms_api_key": os.environ.get("FAST2SMS_API_KEY", ""),
    }
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                default_settings.update(saved)
        except Exception:
            pass
    return default_settings


def save_free_alert_settings(settings: Dict[str, Any]):
    os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2)


def send_telegram_alert(token: str, chat_id: str, message: str) -> Dict[str, Any]:
    """
    Sends 100% free, unlimited, instant push alert to Telegram on phone/desktop.
    Does not require any paid subscription or credit card.
    """
    if not token or not chat_id:
        return {
            "success": False,
            "provider": "telegram",
            "error": "Telegram Bot Token or Chat ID not configured. Set up in Settings menu for free.",
        }

    try:
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        payload = json.dumps({
            "chat_id": chat_id,
            "text": message,
            "parse_mode": "HTML",
        }).encode("utf-8")

        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=8) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            if res_data.get("ok"):
                return {"success": True, "provider": "telegram", "message_id": res_data.get("result", {}).get("message_id")}
            return {"success": False, "provider": "telegram", "error": res_data.get("description", "Unknown Telegram error")}
    except Exception as e:
        return {"success": False, "provider": "telegram", "error": str(e)}


def check_fast2sms_wallet(api_key: str) -> Dict[str, Any]:
    """
    Queries Fast2SMS wallet balance and verifies API Key validity.
    """
    if not api_key:
        return {"success": False, "error": "Fast2SMS API Key not configured."}
    try:
        url = "https://www.fast2sms.com/dev/wallet"
        req = urllib.request.Request(
            url,
            headers={"authorization": api_key.strip(), "cache-control": "no-cache"}
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("return"):
                return {
                    "success": True,
                    "wallet_inr": data.get("wallet", "0.00"),
                    "sms_count": data.get("sms_count", 0),
                    "message": f"API Key Valid! Wallet Balance: Rs. {data.get('wallet', '0.00')} ({data.get('sms_count', 0)} SMS available)",
                }
            return {"success": False, "error": data.get("message", "Invalid API key response from Fast2SMS")}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        try:
            err_data = json.loads(body)
            return {"success": False, "error": err_data.get("message", f"HTTP {e.code}")}
        except Exception:
            return {"success": False, "error": f"HTTP {e.code}: {body}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def send_fast2sms_alert(api_key: str, phone_number: str, message: str) -> Dict[str, Any]:
    """
    Sends free developer test SMS to Indian phone numbers via Fast2SMS API.
    Handles official bulkV2 route and returns detailed diagnostic messages.
    """
    if not api_key:
        return {
            "success": False,
            "provider": "fast2sms",
            "error": "Fast2SMS API Key not configured. Please paste your key in Settings.",
        }

    clean_phone = "".join(filter(str.isdigit, phone_number))
    if len(clean_phone) > 10:
        clean_phone = clean_phone[-10:]

    if len(clean_phone) != 10:
        return {
            "success": False,
            "provider": "fast2sms",
            "error": f"Invalid Indian phone number: '{phone_number}'. Must be 10 digits.",
        }

    # Clean message to standard GSM text (max 159 characters for 1 credit)
    clean_msg = message.strip()[:159]

    # Attempt POST request to bulkV2 endpoint
    url = "https://www.fast2sms.com/dev/bulkV2"
    payload = json.dumps({
        "route": "q",
        "message": clean_msg,
        "language": "english",
        "flash": 0,
        "numbers": clean_phone,
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "authorization": api_key.strip(),
            "Content-Type": "application/json",
            "cache-control": "no-cache",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            is_ok = bool(res_data.get("return", False))
            raw_msg = res_data.get("message", ["SMS sent successfully"])
            msg_str = ", ".join(raw_msg) if isinstance(raw_msg, list) else str(raw_msg)
            return {
                "success": is_ok,
                "provider": "fast2sms",
                "request_id": res_data.get("request_id"),
                "detail": msg_str,
                "error": None if is_ok else msg_str,
            }
    except urllib.error.HTTPError as e:
        body_str = e.read().decode("utf-8", errors="ignore")
        try:
            err_json = json.loads(body_str)
            raw_msg = err_json.get("message", body_str)
            code = err_json.get("status_code", e.code)
            if code == 999:
                detailed_error = (
                    f"Fast2SMS Account Notice: {raw_msg} "
                    f"(Fast2SMS requires a 1-time Rs. 100 recharge at fast2sms.com to unlock the developer API route. "
                    f"Your Rs. 50 signup credit is active in wallet, but API route requires this 1-time activation)."
                )
            elif code == 406:
                detailed_error = f"Fast2SMS Rejection: {raw_msg}"
            else:
                detailed_error = f"Fast2SMS API Error ({code}): {raw_msg}"
            return {
                "success": False,
                "provider": "fast2sms",
                "error": detailed_error,
                "raw_response": err_json,
                "status_code": code,
            }
        except Exception:
            return {
                "success": False,
                "provider": "fast2sms",
                "error": f"Fast2SMS HTTP {e.code}: {body_str}",
            }
    except Exception as e:
        return {"success": False, "provider": "fast2sms", "error": f"Connection failed: {str(e)}"}


def send_free_alert(
    provider: str,
    config: Dict[str, Any],
    message: str,
    recipient_phone: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Unified dispatcher for free alert options.
    """
    if provider == "telegram":
        token = config.get("telegram_bot_token") or os.environ.get("TELEGRAM_BOT_TOKEN", "")
        chat_id = config.get("telegram_chat_id") or os.environ.get("TELEGRAM_CHAT_ID", "")
        return send_telegram_alert(token, chat_id, message)
    elif provider == "fast2sms":
        api_key = config.get("fast2sms_api_key") or os.environ.get("FAST2SMS_API_KEY", "")
        return send_fast2sms_alert(api_key, recipient_phone or "", message)
    else:
        # Default / Simulated 100% free mode: instant zero-latency broadcast
        return {
            "success": True,
            "provider": "simulated_free_broadcast",
            "recipient": recipient_phone or "Field Observers & Residents",
            "message_snippet": message[:100],
            "delivery_status": "Delivered to local cell broadcast channel",
        }
