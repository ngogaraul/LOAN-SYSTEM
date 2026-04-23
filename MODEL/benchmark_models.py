from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
SRC_ROOT = PROJECT_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from credit_scoring.benchmark import run_benchmark
from credit_scoring.config import load_config


def format_benchmark_table(records: list[dict[str, object]]) -> str:
    headers = ["model_name", "accuracy", "balanced_accuracy", "macro_f1", "test_groups", "test_rows"]
    rows = []
    for record in records:
        rows.append(
            [
                str(record["model_name"]),
                f'{float(record["accuracy"]):.4f}',
                f'{float(record["balanced_accuracy"]):.4f}',
                f'{float(record["macro_f1"]):.4f}',
                str(record["test_groups"]),
                str(record["test_rows"]),
            ]
        )

    widths = []
    for idx, header in enumerate(headers):
        cell_width = max(len(header), *(len(row[idx]) for row in rows))
        widths.append(cell_width)

    def _fmt(items: list[str]) -> str:
        return " | ".join(item.ljust(widths[idx]) for idx, item in enumerate(items))

    separator = "-+-".join("-" * width for width in widths)
    lines = [_fmt(headers), separator]
    lines.extend(_fmt(row) for row in rows)
    return "\n".join(lines)


def main() -> None:
    config = load_config(PROJECT_ROOT / "config" / "train_config.yaml")
    result = run_benchmark(PROJECT_ROOT, config)
    records = result.benchmark_frame.to_dict(orient="records")
    print("Algorithms benchmarked:")
    print(format_benchmark_table(records))
    print()
    print(
        json.dumps(
            {
                "output_dir": str(result.output_dir),
                "best_model": result.best_model.model_name,
                "benchmark": records,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
