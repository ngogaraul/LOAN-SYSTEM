from __future__ import annotations

from dataclasses import dataclass

import pandas as pd
from sklearn.model_selection import GroupShuffleSplit

from .config import AppConfig
from .features import PreparedDataset


@dataclass(slots=True)
class SplitData:
    train_frame: pd.DataFrame
    test_frame: pd.DataFrame


def grouped_train_test_split(prepared: PreparedDataset, config: AppConfig) -> SplitData:
    frame = prepared.model_frame
    splitter = GroupShuffleSplit(
        n_splits=1,
        test_size=config.training.test_size,
        random_state=config.training.random_state,
    )
    groups = frame[prepared.group_column]
    indices = next(splitter.split(frame, frame[prepared.target_column], groups=groups))
    train_idx, test_idx = indices
    train_frame = frame.iloc[train_idx].reset_index(drop=True)
    test_frame = frame.iloc[test_idx].reset_index(drop=True)

    train_groups = set(train_frame[prepared.group_column].tolist())
    test_groups = set(test_frame[prepared.group_column].tolist())
    overlap = train_groups.intersection(test_groups)
    if overlap:
        raise ValueError("Grouped split failed: some Account values appear in both train and test.")

    return SplitData(train_frame=train_frame, test_frame=test_frame)
