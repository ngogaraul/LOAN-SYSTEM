from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from .config import AppConfig
from .data import load_dataset
from .evaluate import EvaluationOutputs, evaluate_model
from .explain import ExplanationOutputs, build_shap_outputs
from .features import PreparedDataset, prepare_model_frame
from .modeling import TrainedModel, fit_model
from .reporting import create_output_dir, save_artifacts
from .split import SplitData, grouped_train_test_split


@dataclass(slots=True)
class BenchmarkRunResult:
    output_dir: Path
    prepared: PreparedDataset
    split_data: SplitData
    best_model: TrainedModel
    best_evaluation: EvaluationOutputs
    best_explanations: ExplanationOutputs
    benchmark_frame: pd.DataFrame


def run_benchmark(project_root: Path, config: AppConfig) -> BenchmarkRunResult:
    raw_data = load_dataset(project_root, config)
    prepared = prepare_model_frame(raw_data, config)
    split_data = grouped_train_test_split(prepared, config)

    benchmark_rows: list[dict[str, object]] = []
    fitted_models: dict[str, TrainedModel] = {}
    evaluations: dict[str, EvaluationOutputs] = {}

    for model_name in config.training.benchmark_models:
        trained = fit_model(
            train_frame=split_data.train_frame,
            feature_columns=prepared.feature_columns,
            target_column=prepared.target_column,
            config=config,
            model_name=model_name,
        )
        evaluation = evaluate_model(
            trained=trained,
            test_frame=split_data.test_frame,
            feature_columns=prepared.feature_columns,
            target_column=prepared.target_column,
            group_column=prepared.group_column,
            row_id_column=prepared.row_id_column,
        )
        fitted_models[model_name] = trained
        evaluations[model_name] = evaluation
        benchmark_rows.append(
            {
                "model_name": model_name,
                "accuracy": evaluation.metrics["accuracy"],
                "balanced_accuracy": evaluation.metrics["balanced_accuracy"],
                "macro_f1": evaluation.metrics["macro_f1"],
                "test_groups": evaluation.metrics["test_groups"],
                "test_rows": evaluation.metrics["support_rows"],
            }
        )

    benchmark_frame = pd.DataFrame(benchmark_rows).sort_values(
        ["balanced_accuracy", "macro_f1", "accuracy"],
        ascending=[False, False, False],
    ).reset_index(drop=True)
    best_model_name = str(benchmark_frame.iloc[0]["model_name"])
    best_model = fitted_models[best_model_name]
    best_evaluation = evaluations[best_model_name]
    best_explanations = build_shap_outputs(
        trained=best_model,
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
        trained=best_model,
        evaluation=best_evaluation,
        explanations=best_explanations,
    )
    benchmark_frame.to_csv(output_dir / "benchmark_results.csv", index=False)
    (output_dir / "benchmark_results.json").write_text(
        json.dumps(benchmark_rows, indent=2),
        encoding="utf-8",
    )
    (output_dir / "best_model.txt").write_text(best_model_name, encoding="utf-8")

    return BenchmarkRunResult(
        output_dir=output_dir,
        prepared=prepared,
        split_data=split_data,
        best_model=best_model,
        best_evaluation=best_evaluation,
        best_explanations=best_explanations,
        benchmark_frame=benchmark_frame,
    )
