from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


@dataclass(slots=True)
class DataConfig:
    input_path: str
    sheet_name: str | None
    reference_date: str


@dataclass(slots=True)
class FeatureConfig:
    group_column: str
    row_id_column: str
    target_column: str
    id_columns: list[str]
    leakage_columns: list[str]
    optional_exclude_columns: list[str]
    use_optional_exclusions: bool


@dataclass(slots=True)
class TrainingConfig:
    test_size: float
    random_state: int
    n_estimators: int
    min_samples_leaf: int
    benchmark_models: list[str]
    promoted_model: str


@dataclass(slots=True)
class ExplanationConfig:
    shap_top_features: int
    max_background_rows: int
    max_explained_rows: int


@dataclass(slots=True)
class OutputConfig:
    base_dir: str


@dataclass(slots=True)
class AppConfig:
    data: DataConfig
    features: FeatureConfig
    training: TrainingConfig
    explanations: ExplanationConfig
    outputs: OutputConfig


def _load_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        loaded = yaml.safe_load(handle)
    if not isinstance(loaded, dict):
        raise ValueError(f"Configuration file {path} must contain a mapping at the top level.")
    return loaded


def load_config(path: str | Path) -> AppConfig:
    config_path = Path(path)
    raw = _load_yaml(config_path)
    return AppConfig(
        data=DataConfig(**raw["data"]),
        features=FeatureConfig(**raw["features"]),
        training=TrainingConfig(**raw["training"]),
        explanations=ExplanationConfig(**raw["explanations"]),
        outputs=OutputConfig(**raw["outputs"]),
    )
