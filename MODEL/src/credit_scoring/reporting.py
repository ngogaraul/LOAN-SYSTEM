from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd

from .config import AppConfig
from .evaluate import EvaluationOutputs
from .explain import ExplanationOutputs
from .features import PreparedDataset
from .modeling import TrainedModel
from .split import SplitData


def create_output_dir(project_root: Path, config: AppConfig) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    output_dir = project_root / config.outputs.base_dir / timestamp
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def save_artifacts(
    output_dir: Path,
    config: AppConfig,
    prepared: PreparedDataset,
    split_data: SplitData,
    trained: TrainedModel,
    evaluation: EvaluationOutputs,
    explanations: ExplanationOutputs,
) -> None:
    model_path = output_dir / "credit_risk_model.joblib"
    joblib.dump(trained.pipeline, model_path)

    train_target_distribution = (
        split_data.train_frame[prepared.target_column].value_counts(normalize=True).mul(100).round(2).to_dict()
    )
    test_target_distribution = (
        split_data.test_frame[prepared.target_column].value_counts(normalize=True).mul(100).round(2).to_dict()
    )
    governance_warnings: list[str] = []
    max_class_share = max(train_target_distribution.values())
    if max_class_share >= 80:
        governance_warnings.append(
            "Target distribution is highly imbalanced. Use balanced metrics and review minority-class recall before deployment."
        )
    if config.features.leakage_columns:
        governance_warnings.append(
            "Configured leakage-sensitive columns are excluded from training by default and should remain excluded unless the prediction target changes."
        )
    if config.features.use_optional_exclusions:
        governance_warnings.append(
            "Optional arrears-based exclusions are enabled to reduce current-state leakage in the baseline model."
        )

    manifest = {
        "model_name": trained.model_name,
        "target_column": prepared.target_column,
        "group_column": prepared.group_column,
        "row_id_column": prepared.row_id_column,
        "feature_columns": prepared.feature_columns,
        "fico_score_in_features": "FICO Score" in prepared.feature_columns,
        "train_rows": int(len(split_data.train_frame)),
        "test_rows": int(len(split_data.test_frame)),
        "train_accounts": int(split_data.train_frame[prepared.group_column].nunique()),
        "test_accounts": int(split_data.test_frame[prepared.group_column].nunique()),
        "excluded_identifier_columns": config.features.id_columns,
        "excluded_leakage_columns": config.features.leakage_columns,
        "optional_exclusions_enabled": config.features.use_optional_exclusions,
        "optional_exclude_columns": config.features.optional_exclude_columns,
        "train_target_distribution_pct": train_target_distribution,
        "test_target_distribution_pct": test_target_distribution,
        "governance_warnings": governance_warnings,
    }
    (output_dir / "training_manifest.json").write_text(
        json.dumps(manifest, indent=2),
        encoding="utf-8",
    )

    (output_dir / "metrics.json").write_text(
        json.dumps(evaluation.metrics, indent=2),
        encoding="utf-8",
    )
    evaluation.confusion_matrix_frame.to_csv(output_dir / "confusion_matrix.csv", index=True)
    evaluation.prediction_frame.to_csv(output_dir / "test_predictions.csv", index=False)
    explanations.global_importance_frame.to_csv(output_dir / "global_shap_importance.csv", index=False)
    explanations.local_explanations_frame.to_csv(output_dir / "local_shap_explanations.csv", index=False)

    feature_frame = pd.DataFrame({"feature": prepared.feature_columns})
    feature_frame.to_csv(output_dir / "feature_list.csv", index=False)
