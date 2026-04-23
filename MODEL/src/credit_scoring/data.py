from __future__ import annotations

from pathlib import Path

import pandas as pd

from .config import AppConfig


REQUIRED_COLUMNS = {
    "S/N",
    "Account",
    "Creditline",
    "Outstanding",
    "Principal Arrears",
    "InterestArrears",
    "Payment plan",
    "DaysInArrears",
    "Start date",
    "Duration",
    "Remaining Period",
    "Periodicity",
    "Class",
    "Compulsory saving",
    "Voluntary saving",
    "Salary",
    "Target",
}

OPTIONAL_COLUMN_ALIASES = {
    "FICO": "FICO Score",
    "FICO score": "FICO Score",
    "Fico Score": "FICO Score",
    "fico_score": "FICO Score",
    "fico score": "FICO Score",
}

TARGET_NORMALIZATION = {
    "Low Risk": "Low Risk",
    "Medium Risk": "Medium Risk",
    "Moderate Risk": "Medium Risk",
    "High Risk": "High Risk",
}


def load_dataset(project_root: Path, config: AppConfig) -> pd.DataFrame:
    dataset_path = project_root / config.data.input_path
    sheet_name = 0 if config.data.sheet_name is None else config.data.sheet_name
    dataframe = pd.read_excel(dataset_path, sheet_name=sheet_name)
    dataframe.columns = [str(column).strip() for column in dataframe.columns]
    dataframe = dataframe.rename(columns=OPTIONAL_COLUMN_ALIASES)
    _validate_columns(dataframe)
    cleaned = dataframe.copy()
    cleaned["Target"] = cleaned["Target"].map(TARGET_NORMALIZATION).fillna(cleaned["Target"])
    cleaned["Start date"] = pd.to_datetime(cleaned["Start date"], errors="coerce")
    if cleaned["Start date"].isna().any():
        raise ValueError("Found invalid values in 'Start date' after parsing.")
    if "FICO Score" in cleaned.columns:
        cleaned["FICO Score"] = pd.to_numeric(cleaned["FICO Score"], errors="coerce")
    if cleaned["Creditline"].duplicated().any():
        raise ValueError("Expected Creditline to be unique per loan row.")
    return cleaned


def _validate_columns(dataframe: pd.DataFrame) -> None:
    missing = REQUIRED_COLUMNS.difference(dataframe.columns)
    if missing:
        missing_list = ", ".join(sorted(missing))
        raise ValueError(f"Dataset is missing required columns: {missing_list}")
