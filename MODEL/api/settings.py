from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class ApiSettings:
    api_key: str
    model_dir: Path
    host: str
    port: int
    request_limit: int


def load_api_settings(project_root: Path) -> ApiSettings:
    api_key = os.environ.get("CREDIT_SCORING_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("CREDIT_SCORING_API_KEY must be set before starting the API.")

    model_dir_env = os.environ.get("CREDIT_SCORING_MODEL_DIR", "").strip()
    model_dir = Path(model_dir_env) if model_dir_env else _latest_model_dir(project_root / "outputs")
    host = os.environ.get("CREDIT_SCORING_API_HOST", "127.0.0.1").strip() or "127.0.0.1"
    port = int(os.environ.get("CREDIT_SCORING_API_PORT", "8000"))
    request_limit = int(os.environ.get("CREDIT_SCORING_MAX_RECORDS", "500"))
    return ApiSettings(
        api_key=api_key,
        model_dir=model_dir,
        host=host,
        port=port,
        request_limit=request_limit,
    )


def _latest_model_dir(outputs_root: Path) -> Path:
    candidates = []
    if outputs_root.exists():
        for child in outputs_root.iterdir():
            if not child.is_dir():
                continue
            if (child / "credit_risk_model.joblib").exists() and (child / "training_manifest.json").exists():
                candidates.append(child)
    if not candidates:
        raise RuntimeError(
            "No trained model artifacts were found. Set CREDIT_SCORING_MODEL_DIR or run training first."
        )
    return sorted(candidates)[-1]
