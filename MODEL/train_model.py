from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
SRC_ROOT = PROJECT_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from credit_scoring.config import load_config
from credit_scoring.benchmark import run_benchmark
from benchmark_models import format_benchmark_table


def main() -> None:
    config = load_config(PROJECT_ROOT / "config" / "train_config.yaml")
    result = run_benchmark(PROJECT_ROOT, config)
    benchmark_records = result.benchmark_frame.to_dict(orient="records")
    print("Algorithms benchmarked:")
    print(format_benchmark_table(benchmark_records))
    print()
    summary = {
        "output_dir": str(result.output_dir),
        "best_model": result.best_model.model_name,
        "train_rows": len(result.split_data.train_frame),
        "test_rows": len(result.split_data.test_frame),
        "train_accounts": int(result.split_data.train_frame[result.prepared.group_column].nunique()),
        "test_accounts": int(result.split_data.test_frame[result.prepared.group_column].nunique()),
        "feature_count": len(result.prepared.feature_columns),
        "accuracy": result.best_evaluation.metrics["accuracy"],
        "balanced_accuracy": result.best_evaluation.metrics["balanced_accuracy"],
        "macro_f1": result.best_evaluation.metrics["macro_f1"],
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
