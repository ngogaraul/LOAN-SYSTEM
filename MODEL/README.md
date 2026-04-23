# Credit Scoring Training Pipeline

This project trains a credit risk classifier from `Final Raw Data.xlsx` using a modular, auditable workflow.

## What it does

- Loads and validates the workbook
- Engineers loan-level and account-level features
- Prevents customer leakage by splitting with `Account` as the grouping key
- Excludes known leakage columns by default
- Trains a class-balanced multiclass model
- Produces evaluation reports, predictions, analyst flags, and SHAP explanations

## Project layout

- `config/train_config.yaml`: training configuration
- `src/credit_scoring/`: source package
- `train_model.py`: entry point
- `outputs/`: generated artifacts after training

## Default safety choices

- `Account` is used only for grouped splitting, never as a predictor
- `Creditline` and `S/N` are excluded as identifiers
- `Class` and `DaysInArrears` are excluded by default because they are near-direct proxies for the target
- Group-aware validation is enforced to reduce optimistic performance estimates

## Run

```powershell
& "C:\Users\ngoga\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" .\train_model.py
```

Artifacts are written to `outputs/<timestamp>/`.

## Environment

Create the local virtual environment and install dependencies:

```powershell
.\setup_env.ps1
```

Then run scripts with:

```powershell
.\.venv\Scripts\python.exe .\train_model.py
```

## Benchmark

Compare the configured algorithms on the same grouped split:

```powershell
.\.venv\Scripts\python.exe .\benchmark_models.py
```

The benchmark output includes:

- `benchmark_results.csv`
- `benchmark_results.json`
- `best_model.txt`
- the promoted best model artifact and metrics in the same output directory

## API

Set an API key before starting the service:

```powershell
$env:CREDIT_SCORING_API_KEY = "replace-with-a-long-random-secret"
```

Optional settings:

```powershell
$env:CREDIT_SCORING_MODEL_DIR = "C:\Users\ngoga\Downloads\MODEL\outputs\20260420_222223"
$env:CREDIT_SCORING_API_HOST = "127.0.0.1"
$env:CREDIT_SCORING_API_PORT = "8000"
```

Start the API:

```powershell
& "C:\Users\ngoga\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" .\serve_api.py
```

Security defaults:

- API key required on `POST /predict` via `x-api-key`
- Swagger/OpenAPI docs disabled
- Binds to `127.0.0.1` by default
- Strict request schema with extra fields rejected
- Internal errors are not exposed in responses

Use [api_example_request.json](/C:/Users/ngoga/Downloads/MODEL/api_example_request.json) as the starter request body.

## FICO Score

The pipeline now supports an optional `FICO Score` column in both training data and API requests.

- Accepted training column names are normalized to `FICO Score`
- If the workbook includes `FICO Score`, it is used as a predictor
- Account-level FICO context features are also engineered
- If the workbook does not include `FICO Score`, the model trains without it

## Score Output

The current model can return:

- predicted risk class
- an internal `300-850` FICO-style score
- score band
- decision flag

Important:

- this is an internal score mapped from model risk probabilities
- it is not a true bureau FICO score unless you train on real historical FICO labels
