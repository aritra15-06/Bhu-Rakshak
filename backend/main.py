import os
import sys
from contextlib import asynccontextmanager

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from service.prediction_service import PredictionService
from backend.routes import predict, simulate, train, alerts, impact, locations, settings
from backend import config


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Loaded ONCE at process startup -- this is the concrete "one model
    # serves every monitored location" mechanism from
    # service/prediction_service.py, now exposed over HTTP.
    app.state.prediction_service = PredictionService.load_default()
    print(f"[Bhu-Rakshak backend] Model loaded: {config.MODEL_VERSION}")
    print(f"[Bhu-Rakshak backend] Twilio configured: {config.TWILIO_CONFIGURED} "
          f"({'live SMS available' if config.TWILIO_CONFIGURED else 'dry-run only until credentials are set'})")
    yield
    # No teardown needed for this demo -- the process exit handles cleanup.


app = FastAPI(title="Bhu-Rakshak API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "model_loaded": hasattr(app.state, "prediction_service"),
        "twilio_configured": bool(os.environ.get("TWILIO_ACCOUNT_SID") and os.environ.get("TWILIO_AUTH_TOKEN") and os.environ.get("TWILIO_FROM_NUMBER")),
    }


app.include_router(locations.router, prefix="/api")
app.include_router(predict.router, prefix="/api")
app.include_router(simulate.router, prefix="/api")
app.include_router(train.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(impact.router, prefix="/api")
app.include_router(settings.router, prefix="/api")

# Serve the built frontend (frontend/dist after `npm run build`) as
# static files, and serve the synthetic/real terrain heightmap JSON so
# the browser can fetch it directly. Mounted last so /api/* routes above
# take priority.
FRONTEND_DIST = os.path.join(config.REPO_ROOT, "frontend", "dist")
TERRAIN_DIR = os.path.join(config.REPO_ROOT, "terrain3d", "heightmaps")
TEXTURE_DIR = os.path.join(config.REPO_ROOT, "terrain3d", "textures")

if os.path.isdir(TERRAIN_DIR):
    app.mount("/terrain3d/heightmaps", StaticFiles(directory=TERRAIN_DIR), name="terrain")

if os.path.isdir(TEXTURE_DIR):
    app.mount("/terrain3d/textures", StaticFiles(directory=TEXTURE_DIR), name="textures")

if os.path.isdir(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
