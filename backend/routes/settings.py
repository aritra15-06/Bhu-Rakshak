from fastapi import APIRouter
from pydantic import BaseModel
import os
import json
from alerts.free_alert_dispatcher import (
    load_free_alert_settings,
    save_free_alert_settings,
    send_telegram_alert,
    send_fast2sms_alert,
)

router = APIRouter(tags=["settings"])

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SETTINGS_FILE = os.path.join(REPO_ROOT, "data", "sms_settings.json")


class SmsSettingsPayload(BaseModel):
    active_provider: str = "telegram"
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    fast2sms_api_key: str = ""
    account_sid: str = ""
    auth_token: str = ""
    from_number: str = ""


class TestTelegramPayload(BaseModel):
    bot_token: str = ""
    chat_id: str = ""


@router.get("/settings/sms")
def get_sms_settings():
    free = load_free_alert_settings()
    account_sid = os.environ.get("TWILIO_ACCOUNT_SID", "")
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN", "")
    from_number = os.environ.get("TWILIO_FROM_NUMBER", "")

    if not (account_sid and auth_token and from_number) and os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE) as f:
                saved = json.load(f)
                account_sid = account_sid or saved.get("account_sid", "")
                auth_token = auth_token or saved.get("auth_token", "")
                from_number = from_number or saved.get("from_number", "")
                os.environ["TWILIO_ACCOUNT_SID"] = account_sid
                os.environ["TWILIO_AUTH_TOKEN"] = auth_token
                os.environ["TWILIO_FROM_NUMBER"] = from_number
        except Exception:
            pass

    active_provider = free.get("active_provider", "telegram")
    has_telegram = bool(free.get("telegram_bot_token") and free.get("telegram_chat_id"))
    has_fast2sms = bool(free.get("fast2sms_api_key"))
    has_twilio = bool(account_sid and auth_token and from_number)

    return {
        "active_provider": active_provider,
        "telegram_bot_token": free.get("telegram_bot_token", ""),
        "telegram_chat_id": free.get("telegram_chat_id", ""),
        "has_telegram_token": bool(free.get("telegram_bot_token")),
        "fast2sms_api_key": free.get("fast2sms_api_key", ""),
        "has_fast2sms_key": bool(free.get("fast2sms_api_key")),
        "account_sid": account_sid,
        "from_number": from_number,
        "has_token": bool(auth_token),
        "is_configured": (
            (active_provider == "telegram" and has_telegram)
            or (active_provider == "fast2sms" and has_fast2sms)
            or (active_provider == "twilio" and has_twilio)
            or (active_provider == "simulated")
        ),
    }


@router.post("/settings/sms")
def save_sms_settings(payload: SmsSettingsPayload):
    free = load_free_alert_settings()

    if payload.active_provider:
        free["active_provider"] = payload.active_provider
    if payload.telegram_bot_token.strip():
        free["telegram_bot_token"] = payload.telegram_bot_token.strip()
        os.environ["TELEGRAM_BOT_TOKEN"] = free["telegram_bot_token"]
    if payload.telegram_chat_id.strip():
        free["telegram_chat_id"] = payload.telegram_chat_id.strip()
        os.environ["TELEGRAM_CHAT_ID"] = free["telegram_chat_id"]
    if payload.fast2sms_api_key.strip():
        free["fast2sms_api_key"] = payload.fast2sms_api_key.strip()
        os.environ["FAST2SMS_API_KEY"] = free["fast2sms_api_key"]

    save_free_alert_settings(free)

    # Legacy Twilio handling
    if payload.account_sid.strip():
        os.environ["TWILIO_ACCOUNT_SID"] = payload.account_sid.strip()
    if payload.auth_token.strip():
        os.environ["TWILIO_AUTH_TOKEN"] = payload.auth_token.strip()
    if payload.from_number.strip():
        os.environ["TWILIO_FROM_NUMBER"] = payload.from_number.strip()

    os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
    try:
        data = {
            "account_sid": os.environ.get("TWILIO_ACCOUNT_SID", ""),
            "auth_token": os.environ.get("TWILIO_AUTH_TOKEN", ""),
            "from_number": os.environ.get("TWILIO_FROM_NUMBER", ""),
        }
        with open(SETTINGS_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        return {"saved": False, "error": str(e)}

    active_provider = free.get("active_provider", "telegram")
    has_telegram = bool(free.get("telegram_bot_token") and free.get("telegram_chat_id"))
    has_fast2sms = bool(free.get("fast2sms_api_key"))
    has_twilio = bool(
        os.environ.get("TWILIO_ACCOUNT_SID")
        and os.environ.get("TWILIO_AUTH_TOKEN")
        and os.environ.get("TWILIO_FROM_NUMBER")
    )

    is_configured = (
        (active_provider == "telegram" and has_telegram)
        or (active_provider == "fast2sms" and has_fast2sms)
        or (active_provider == "twilio" and has_twilio)
        or (active_provider == "simulated")
    )

    return {
        "saved": True,
        "is_configured": is_configured,
        "active_provider": active_provider,
    }


@router.post("/settings/test-telegram")
def test_telegram(payload: TestTelegramPayload):
    free = load_free_alert_settings()
    token = payload.bot_token.strip() or free.get("telegram_bot_token", "")
    chat_id = payload.chat_id.strip() or free.get("telegram_chat_id", "")

    if not token or not chat_id:
        return {
            "success": False,
            "error": "Please enter both Telegram Bot Token and Chat ID before testing.",
        }

    test_msg = (
        "🚨 <b>BHU-RAKSHAK TEST ALERT</b>\n"
        "━━━━━━━━━━━━━━━━━━\n"
        "✅ <b>Connection verified!</b> Free Telegram alert integration is active and operating in real-time.\n"
        "📍 Region: North Sikkim Test Sector\n"
        "⏰ Status: Ready to receive real-time landslide warnings."
    )
    result = send_telegram_alert(token, chat_id, test_msg)
    return result
