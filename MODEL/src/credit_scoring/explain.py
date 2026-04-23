from __future__ import annotations

import contextlib
import io
from dataclasses import dataclass

import numpy as np
import pandas as pd
import shap
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier

from .config import AppConfig
from .modeling import TrainedModel


@dataclass(slots=True)
class ExplanationOutputs:
    global_importance_frame: pd.DataFrame
    local_explanations_frame: pd.DataFrame


def build_shap_outputs(
    trained: TrainedModel,
    train_frame: pd.DataFrame,
    test_frame: pd.DataFrame,
    feature_columns: list[str],
    target_column: str,
    group_column: str,
    row_id_column: str,
    config: AppConfig,
) -> ExplanationOutputs:
    model = trained.pipeline.named_steps["model"]

    preprocess = trained.pipeline[:-1]
    x_train = pd.DataFrame(preprocess.transform(train_frame[feature_columns]), columns=feature_columns)
    x_test = pd.DataFrame(preprocess.transform(test_frame[feature_columns]), columns=feature_columns)

    background = x_train.head(config.explanations.max_background_rows)
    explain_rows = min(config.explanations.max_explained_rows, len(x_test))
    x_explain = x_test.head(explain_rows)
    meta = test_frame[[group_column, row_id_column, target_column]].head(explain_rows).reset_index(drop=True)
    predicted_labels = trained.pipeline.predict(test_frame[feature_columns].head(explain_rows))

    explainer = _build_explainer(model=model, background=background)
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        shap_values = explainer.shap_values(x_explain)

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

    global_rows: list[dict] = []
    for class_label, class_values in shap_by_class.items():
        mean_abs = np.abs(class_values).mean(axis=0)
        for feature_name, score in zip(feature_columns, mean_abs, strict=False):
            global_rows.append(
                {
                    "class_label": class_label,
                    "feature": feature_name,
                    "mean_abs_shap": float(score),
                }
            )

    global_importance = (
        pd.DataFrame(global_rows)
        .sort_values(["class_label", "mean_abs_shap"], ascending=[True, False])
        .reset_index(drop=True)
    )

    top_n = config.explanations.shap_top_features
    local_rows: list[dict] = []
    for row_index in range(len(x_explain)):
        predicted_label = predicted_labels[row_index]
        class_values = shap_by_class[predicted_label][row_index]
        feature_values = x_explain.iloc[row_index]
        top_indices = np.argsort(np.abs(class_values))[::-1][:top_n]
        row: dict[str, object] = {
            group_column: meta.loc[row_index, group_column],
            row_id_column: meta.loc[row_index, row_id_column],
            target_column: meta.loc[row_index, target_column],
            "predicted_target": predicted_label,
        }
        explanations = []
        for rank, feature_idx in enumerate(top_indices, start=1):
            feature_name = feature_columns[feature_idx]
            shap_score = float(class_values[feature_idx])
            feature_value = float(feature_values.iloc[feature_idx])
            direction = "pushes_toward" if shap_score >= 0 else "pushes_away"
            row[f"top_feature_{rank}"] = feature_name
            row[f"top_feature_{rank}_value"] = feature_value
            row[f"top_feature_{rank}_shap"] = shap_score
            explanations.append(
                f"{feature_name}={feature_value:.4f} ({direction} {predicted_label}, shap={shap_score:.4f})"
            )
        row["analyst_summary"] = "; ".join(explanations)
        local_rows.append(row)

    local_explanations = pd.DataFrame(local_rows)
    return ExplanationOutputs(
        global_importance_frame=global_importance,
        local_explanations_frame=local_explanations,
    )


def _build_explainer(model, background: pd.DataFrame):
    if isinstance(model, (RandomForestClassifier, ExtraTreesClassifier, DecisionTreeClassifier)):
        return shap.TreeExplainer(model, data=background, feature_perturbation="interventional")
    if isinstance(model, LogisticRegression):
        return shap.LinearExplainer(model, background)
    raise ValueError(f"Unsupported model type for explanations: {type(model).__name__}")
