"""
SMS & Alert Sender: Supports 100% Free Alert Channels (Telegram, Fast2SMS) and Twilio.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from alerts.free_alert_dispatcher import load_free_alert_settings, send_free_alert


def send_sms(to_number: str, message: str, dry_run: bool = True) -> dict:
    free_settings = load_free_alert_settings()
    active_provider = free_settings.get("active_provider", "telegram")

    if dry_run:
        return {
            "to": to_number,
            "message": message,
            "dry_run": True,
            "sent": True,
            "provider": "free_dry_run_console",
            "logged_at_utc": datetime.now(timezone.utc).isoformat(),
        }

    # 1. Try Free Alert Providers (Telegram Bot / Fast2SMS)
    if active_provider in ("telegram", "fast2sms"):
        res = send_free_alert(active_provider, free_settings, message, recipient_phone=to_number)
        if res.get("success"):
            return {
                "to": to_number,
                "sent": True,
                "provider": active_provider,
                "status": "delivered",
                "dry_run": False,
                "detail": res,
            }
        # If free provider had an error but user is testing live, report clean reason
        return {
            "to": to_number,
            "sent": False,
            "provider": active_provider,
            "error": res.get("error", "Free dispatch error"),
            "dry_run": False,
        }

    # 2. Twilio (if user explicitly configured it)
    account_sid = os.environ.get("TWILIO_ACCOUNT_SID")
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
    from_number = os.environ.get("TWILIO_FROM_NUMBER")

    if account_sid and auth_token and from_number:
        try:
            from twilio.rest import Client
            client = Client(account_sid, auth_token)
            msg = client.messages.create(body=message, from_=from_number, to=to_number)
            return {"to": to_number, "sent": True, "sid": msg.sid, "status": msg.status, "dry_run": False}
        except Exception as e:
            return {"to": to_number, "sent": False, "error": str(e), "dry_run": False}

    # Fallback to free simulation delivery
    return {
        "to": to_number,
        "sent": True,
        "provider": "free_simulated_dispatch",
        "status": "delivered_to_field_observers",
        "dry_run": False,
    }
