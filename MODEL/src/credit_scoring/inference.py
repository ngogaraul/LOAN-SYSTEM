from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
import shap
import numpy as np

from .config import AppConfig
from .features import prepare_inference_frame
from .scoring import risk_probabilities_to_score, score_to_band, score_to_flag


@dataclass(slots=True)
class InferenceArtifacts:
    pipeline: Any
    manifest: dict[str, Any]
    feature_columns: list[str]


def load_inference_artifacts(model_dir: Path) -> InferenceArtifacts:
    model_path = model_dir / "credit_risk_model.joblib"
    manifest_path = model_dir / "training_manifest.json"
    if not model_path.exists():
        raise FileNotFoundError(f"Model artifact not found at {model_path}")
    if not manifest_path.exists():
        raise FileNotFoundError(f"Training manifest not found at {manifest_path}")

    pipeline = joblib.load(model_path)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    feature_columns = manifest["feature_columns"]
    return InferenceArtifacts(pipeline=pipeline, manifest=manifest, feature_columns=feature_columns)


def predict_records(
    records: list[dict[str, Any]],
    artifacts: InferenceArtifacts,
    config: AppConfig,
) -> list[dict[str, Any]]:
    raw_frame = pd.DataFrame(records)
    prepared = prepare_inference_frame(raw_frame, config, artifacts.feature_columns)
    preprocess = artifacts.pipeline[:-1]
    model = artifacts.pipeline.named_steps["model"]
    transformed = pd.DataFrame(
        preprocess.transform(prepared[artifacts.feature_columns]),
        columns=artifacts.feature_columns,
    )
    probabilities = artifacts.pipeline.predict_proba(prepared[artifacts.feature_columns])
    predicted_labels = artifacts.pipeline.predict(prepared[artifacts.feature_columns])
    top_factors_by_row = explain_prediction_rows(
        transformed=transformed,
        model=model,
        predicted_labels=list(predicted_labels),
        feature_columns=artifacts.feature_columns,
    )

    response_rows: list[dict[str, Any]] = []
    classes = list(artifacts.pipeline.classes_)
    for idx, predicted_label in enumerate(predicted_labels):
        probability_map = {
            str(class_label): float(probabilities[idx][class_index])
            for class_index, class_label in enumerate(classes)
        }
        fico_like_score = risk_probabilities_to_score(probability_map)
        response_rows.append(
            {
                "account": str(prepared.iloc[idx][config.features.group_column]),
                "creditline": str(prepared.iloc[idx][config.features.row_id_column]),
                "predicted_target": str(predicted_label),
                "fico_like_score": fico_like_score,
                "score_band": score_to_band(fico_like_score),
                "risk_flag": score_to_flag(fico_like_score),
                "probabilities": probability_map,
                "top_factors": top_factors_by_row[idx],
            }
        )
    return response_rows


def explain_prediction_rows(
    transformed: pd.DataFrame,
    model,
    predicted_labels: list[str],
    feature_columns: list[str],
    top_n: int = 5,
) -> list[list[dict[str, object]]]:
    if transformed.empty:
        return [[] for _ in predicted_labels]

    background = pd.DataFrame(
        np.zeros((1, len(feature_columns))),
        columns=feature_columns,
    )
    explainer = shap.LinearExplainer(model, background)
    shap_values = explainer.shap_values(transformed)
    class_labels = list(model.classes_)

    if isinstance(shap_values, list):
        shap_by_class = {
            class_label: np.asarray(class_value)
            for class_label, class_value in zip(class_labels, shap_values, strict=False)
        }
    else:
        raw = np.asarray(shap_values)
        if raw.ndim == 3:
            shap_by_class = {
                class_label: raw[:, :, class_index]
                for class_index, class_label in enumerate(class_labels)
            }
        else:
            raise ValueError("Unexpected SHAP output shape for multiclass explanations.")

    explanations: list[list[dict[str, object]]] = []
    for row_index, predicted_label in enumerate(predicted_labels):
        row_values = transformed.iloc[row_index]
        class_values = shap_by_class[predicted_label][row_index]
        top_indices = np.argsort(np.abs(class_values))[::-1][:top_n]

        row_factors: list[dict[str, object]] = []
        for feature_idx in top_indices:
            impact = float(class_values[feature_idx])
            if predicted_label == "Low Risk":
                direction = "decreases_risk" if impact >= 0 else "increases_risk"
            elif predicted_label == "High Risk":
                direction = "increases_risk" if impact >= 0 else "decreases_risk"
            else:
                direction = "increases_risk" if impact >= 0 else "decreases_risk"
            row_factors.append({
                "feature": feature_columns[feature_idx],
                "impact": impact,
                "direction": direction,
                "feature_value": float(row_values.iloc[feature_idx]),
            })
        explanations.append(row_factors)

    return explanations
