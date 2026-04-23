from __future__ import annotations

from dataclasses import dataclass

import pandas as pd
from sklearn.metrics import accuracy_score, balanced_accuracy_score, classification_report, confusion_matrix, f1_score

from .modeling import TrainedModel
from .scoring import risk_probabilities_to_score, score_to_band, score_to_flag


@dataclass(slots=True)
class EvaluationOutputs:
    metrics: dict
    prediction_frame: pd.DataFrame
    confusion_matrix_frame: pd.DataFrame


def evaluate_model(
    trained: TrainedModel,
    test_frame: pd.DataFrame,
    feature_columns: list[str],
    target_column: str,
    group_column: str,
    row_id_column: str,
) -> EvaluationOutputs:
    x_test = test_frame[feature_columns]
    y_true = test_frame[target_column]
    y_pred = trained.pipeline.predict(x_test)
    probabilities = trained.pipeline.predict_proba(x_test)
    probability_frame = pd.DataFrame(
        probabilities,
        columns=[f"prob_{label.lower().replace(' ', '_')}" for label in trained.pipeline.classes_],
    )

    prediction_frame = test_frame[[group_column, row_id_column, target_column]].copy()
    prediction_frame["predicted_target"] = y_pred
    prediction_frame["correct_prediction"] = prediction_frame[target_column] == prediction_frame["predicted_target"]
    prediction_frame = pd.concat([prediction_frame.reset_index(drop=True), probability_frame], axis=1)
    probability_columns = [f"prob_{label.lower().replace(' ', '_')}" for label in trained.pipeline.classes_]
    probability_records = prediction_frame[probability_columns].to_dict(orient="records")
    score_probabilities = []
    for record in probability_records:
        score_probabilities.append(
            {
                label: float(record[f"prob_{label.lower().replace(' ', '_')}"])
                for label in trained.pipeline.classes_
            }
        )
    prediction_frame["fico_like_score"] = [risk_probabilities_to_score(item) for item in score_probabilities]
    prediction_frame["score_band"] = prediction_frame["fico_like_score"].map(score_to_band)
    prediction_frame["risk_flag"] = prediction_frame["fico_like_score"].map(score_to_flag)

    labels = list(trained.pipeline.classes_)
    confusion = confusion_matrix(y_true, y_pred, labels=labels)
    confusion_frame = pd.DataFrame(confusion, index=labels, columns=labels)

    report = classification_report(y_true, y_pred, output_dict=True, zero_division=0)
    metrics = {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "balanced_accuracy": round(float(balanced_accuracy_score(y_true, y_pred)), 4),
        "macro_f1": round(float(f1_score(y_true, y_pred, average="macro", zero_division=0)), 4),
        "support_rows": int(len(test_frame)),
        "test_groups": int(test_frame[group_column].nunique()),
        "classification_report": report,
    }

    return EvaluationOutputs(
        metrics=metrics,
        prediction_frame=prediction_frame,
        confusion_matrix_frame=confusion_frame,
    )
