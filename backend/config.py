"""Backend configuration. Twilio credentials are read from environment
variables only -- never hardcode them here or commit them to the repo."""

import os

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.environ.get("TWILIO_FROM_NUMBER", "")
TWILIO_CONFIGURED = bool(TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER)

CORS_ORIGINS = ["*"]  # fine for a local-only demo; tighten if ever deployed beyond localhost

MODEL_VERSION = "xgb_landslide_v1.0"

OPENTOPOGRAPHY_API_KEY = os.environ.get("OPENTOPOGRAPHY_API_KEY", "8af0651141b620ec93f2b78b22a2497c")
OPENTOPOGRAPHY_CONFIGURED = bool(OPENTOPOGRAPHY_API_KEY)
