from __future__ import annotations

from pathlib import Path

from .config import AppConfig
from .data import load_dataset
from .evaluate import EvaluationOutputs, evaluate_model
from .explain import ExplanationOutputs, build_shap_outputs
from .features import PreparedDataset, prepare_model_frame
from .modeling import TrainedModel, fit_model
from .reporting import create_output_dir, save_artifacts
from .split import SplitData, grouped_train_test_split


def run_training(project_root: Path, config: AppConfig) -> tuple[Path, PreparedDataset, SplitData, TrainedModel, EvaluationOutputs, ExplanationOutputs]:
    raw_data = load_dataset(project_root, config)
    prepared = prepare_model_frame(raw_data, config)
    split_data = grouped_train_test_split(prepared, config)
    trained = fit_model(
        train_frame=split_data.train_frame,
        feature_columns=prepared.feature_columns,
        target_column=prepared.target_column,
        config=config,
    )
    evaluation = evaluate_model(
        trained=trained,
        test_frame=split_data.test_frame,
        feature_columns=prepared.feature_columns,
        target_column=prepared.target_column,
        group_column=prepared.group_column,
        row_id_column=prepared.row_id_column,
    )
    explanations = build_shap_outputs(
        trained=trained,
        train_frame=split_data.train_frame,
        test_frame=split_data.test_frame,
        feature_columns=prepared.feature_columns,
        target_column=prepared.target_column,
        group_column=prepared.group_column,
        row_id_column=prepared.row_id_column,
        config=config,
    )
    output_dir = create_output_dir(project_root, config)
    save_artifacts(
        output_dir=output_dir,
        config=config,
        prepared=prepared,
        split_data=split_data,
        trained=trained,
        evaluation=evaluation,
        explanations=explanations,
    )
    return output_dir, prepared, split_data, trained, evaluation, explanations
