from __future__ import annotations

import sys
import uuid
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SRC_ROOT = PROJECT_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from credit_scoring.config import load_config
from credit_scoring.inference import load_inference_artifacts, predict_records

from .schemas import HealthResponse, PredictionRequest, PredictionResponse
from .security import api_key_dependency
from .settings import load_api_settings


settings = load_api_settings(PROJECT_ROOT)
config = load_config(PROJECT_ROOT / "config" / "train_config.yaml")
artifacts = load_inference_artifacts(settings.model_dir)

app = FastAPI(
    title="Credit Scoring API",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.middleware("http")
async def attach_request_id(request: Request, call_next):
    request_id = str(uuid.uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, _exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error."},
    )


@app.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    return HealthResponse(status="ok", model_dir=str(settings.model_dir))


@app.post(
    "/predict",
    response_model=PredictionResponse,
    dependencies=[Depends(api_key_dependency(settings.api_key))],
)
def predict(payload: PredictionRequest) -> PredictionResponse:
    if len(payload.records) > settings.request_limit:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Request exceeds the maximum of {settings.request_limit} records.",
        )
    records = [record.to_feature_record() for record in payload.records]
    results = predict_records(records=records, artifacts=artifacts, config=config)
    return PredictionResponse(record_count=len(results), results=results)
