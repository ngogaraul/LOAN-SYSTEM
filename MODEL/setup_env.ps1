param(
    [string]$PythonExe = "C:\Users\ngoga\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvPath = Join-Path $ProjectRoot ".venv"

if (-not (Test-Path $VenvPath)) {
    & $PythonExe -m venv $VenvPath
}

$VenvPython = Join-Path $VenvPath "Scripts\python.exe"
& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install -r (Join-Path $ProjectRoot "requirements.txt")

Write-Host "Environment ready at $VenvPath"
