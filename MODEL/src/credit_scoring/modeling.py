from __future__ import annotations

from dataclasses import dataclass

import pandas as pd
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

from .config import AppConfig


@dataclass(slots=True)
class TrainedModel:
    pipeline: Pipeline
    class_labels: list[str]
    model_name: str


def build_training_pipeline(config: AppConfig, model_name: str) -> Pipeline:
    if model_name == "logistic_regression":
        model = LogisticRegression(
            max_iter=2000,
            class_weight="balanced",
            random_state=config.training.random_state,
        )
        steps = [
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
            ("model", model),
        ]
    elif model_name == "decision_tree":
        model = DecisionTreeClassifier(
            class_weight="balanced",
            min_samples_leaf=config.training.min_samples_leaf,
            random_state=config.training.random_state,
        )
        steps = [
            ("imputer", SimpleImputer(strategy="median")),
            ("model", model),
        ]
    elif model_name == "random_forest":
        model = RandomForestClassifier(
            n_estimators=config.training.n_estimators,
            min_samples_leaf=config.training.min_samples_leaf,
            class_weight="balanced_subsample",
            random_state=config.training.random_state,
            n_jobs=1,
        )
        steps = [
            ("imputer", SimpleImputer(strategy="median")),
            ("model", model),
        ]
    elif model_name == "extra_trees":
        model = ExtraTreesClassifier(
            n_estimators=config.training.n_estimators,
            min_samples_leaf=config.training.min_samples_leaf,
            class_weight="balanced_subsample",
            random_state=config.training.random_state,
            n_jobs=1,
        )
        steps = [
            ("imputer", SimpleImputer(strategy="median")),
            ("model", model),
        ]
    else:
        raise ValueError(f"Unsupported model_name: {model_name}")

    return Pipeline(steps=steps)


def fit_model(
    train_frame: pd.DataFrame,
    feature_columns: list[str],
    target_column: str,
    config: AppConfig,
    model_name: str | None = None,
) -> TrainedModel:
    selected_model = model_name or config.training.promoted_model
    pipeline = build_training_pipeline(config, selected_model)
    pipeline.fit(train_frame[feature_columns], train_frame[target_column])
    class_labels = sorted(train_frame[target_column].dropna().unique().tolist())
    return TrainedModel(pipeline=pipeline, class_labels=class_labels, model_name=selected_model)
