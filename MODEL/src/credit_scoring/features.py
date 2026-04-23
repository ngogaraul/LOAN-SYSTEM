from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .config import AppConfig


@dataclass(slots=True)
class PreparedDataset:
    model_frame: pd.DataFrame
    feature_columns: list[str]
    target_column: str
    group_column: str
    row_id_column: str


def prepare_model_frame(dataframe: pd.DataFrame, config: AppConfig) -> PreparedDataset:
    frame = engineer_features(dataframe=dataframe, config=config)

    feature_exclusions = set(config.features.id_columns)
    feature_exclusions.update(config.features.leakage_columns)
    feature_exclusions.add(config.features.target_column)
    feature_exclusions.add("Start date")
    if config.features.use_optional_exclusions:
        feature_exclusions.update(config.features.optional_exclude_columns)
        feature_exclusions.update({"principal_arrears_ratio", "interest_arrears_ratio"})

    numeric_columns = frame.select_dtypes(include=["number", "bool"]).columns.tolist()
    feature_columns = [column for column in numeric_columns if column not in feature_exclusions]
    feature_columns = [column for column in feature_columns if frame[column].notna().any()]

    model_frame = frame.copy()
    for column in feature_columns:
        model_frame[column] = model_frame[column].replace([np.inf, -np.inf], np.nan)

    return PreparedDataset(
        model_frame=model_frame,
        feature_columns=feature_columns,
        target_column=config.features.target_column,
        group_column=config.features.group_column,
        row_id_column=config.features.row_id_column,
    )


def prepare_inference_frame(dataframe: pd.DataFrame, config: AppConfig, feature_columns: list[str]) -> pd.DataFrame:
    frame = engineer_features(dataframe=dataframe, config=config)
    for column in feature_columns:
        if column not in frame.columns:
            frame[column] = np.nan
        frame[column] = frame[column].replace([np.inf, -np.inf], np.nan)
    return frame


def engineer_features(dataframe: pd.DataFrame, config: AppConfig) -> pd.DataFrame:
    frame = dataframe.copy()
    reference_date = pd.Timestamp(config.data.reference_date)

    frame["Start date"] = pd.to_datetime(frame["Start date"], errors="coerce")
    if frame["Start date"].isna().any():
        raise ValueError("Found invalid values in 'Start date'.")

    # Loan timing features
    frame["loan_age_days"] = (reference_date - frame["Start date"]).dt.days
    frame["start_year"] = frame["Start date"].dt.year
    frame["start_month"] = frame["Start date"].dt.month

    # Optional columns may not be present in inference-only payloads.
    frame["Principal Arrears"] = frame.get("Principal Arrears", 0)
    frame["InterestArrears"] = frame.get("InterestArrears", 0)
    if "FICO Score" not in frame.columns:
        frame["FICO Score"] = np.nan
    frame["FICO Score"] = pd.to_numeric(frame["FICO Score"], errors="coerce")

    # Loan ratios
    frame["outstanding_to_payment_ratio"] = _safe_ratio(frame["Outstanding"], frame["Payment plan"])
    frame["remaining_to_duration_ratio"] = _safe_ratio(frame["Remaining Period"], frame["Duration"])
    frame["principal_arrears_ratio"] = _safe_ratio(frame["Principal Arrears"], frame["Outstanding"])
    frame["interest_arrears_ratio"] = _safe_ratio(frame["InterestArrears"], frame["Outstanding"])
    frame["compulsory_saving_to_outstanding_ratio"] = _safe_ratio(frame["Compulsory saving"], frame["Outstanding"])
    frame["voluntary_saving_to_outstanding_ratio"] = _safe_ratio(frame["Voluntary saving"], frame["Outstanding"])
    frame["salary_to_payment_ratio"] = _safe_ratio(frame["Salary"], frame["Payment plan"])
    frame["total_savings"] = frame["Compulsory saving"].fillna(0) + frame["Voluntary saving"].fillna(0)
    frame["total_savings_to_outstanding_ratio"] = _safe_ratio(frame["total_savings"], frame["Outstanding"])

    # Account context features for loan-level modeling
    account_group = frame.groupby(config.features.group_column, dropna=False)
    frame["account_loan_count"] = account_group[config.features.row_id_column].transform("count")
    frame["account_total_outstanding"] = account_group["Outstanding"].transform("sum")
    frame["account_total_payment_plan"] = account_group["Payment plan"].transform("sum")
    frame["account_total_savings"] = account_group["total_savings"].transform("sum")
    frame["account_max_remaining_period"] = account_group["Remaining Period"].transform("max")
    frame["account_mean_duration"] = account_group["Duration"].transform("mean")
    frame["account_mean_fico_score"] = account_group["FICO Score"].transform("mean")
    frame["account_min_fico_score"] = account_group["FICO Score"].transform("min")
    frame["fico_gap_to_account_mean"] = frame["FICO Score"] - frame["account_mean_fico_score"]
    frame["loan_share_of_account_outstanding"] = _safe_ratio(
        frame["Outstanding"], frame["account_total_outstanding"]
    )
    frame["account_savings_to_outstanding_ratio"] = _safe_ratio(
        frame["account_total_savings"], frame["account_total_outstanding"]
    )
    return frame


def _safe_ratio(numerator: pd.Series, denominator: pd.Series) -> pd.Series:
    clean_denominator = denominator.replace(0, np.nan)
    return numerator / clean_denominator
