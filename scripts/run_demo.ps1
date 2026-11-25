param(
    [ValidateRange(1, 65535)][int]$Port = 8000,
    [switch]$InstallDependencies
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $root
try {
    if ($InstallDependencies) {
        if (-not (Test-Path .venv\Scripts\python.exe)) {
            python -m venv .venv
            if ($LASTEXITCODE -ne 0) { throw "Could not create the virtual environment" }
        }
        & .\.venv\Scripts\python.exe -m pip install -r requirements.txt
        if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed" }
    }
    $python = if (Test-Path .venv\Scripts\python.exe) { ".\.venv\Scripts\python.exe" } else { "python" }
    & $python -m uvicorn backend.main:app --host 127.0.0.1 --port $Port
    if ($LASTEXITCODE -ne 0) { throw "API startup failed" }
} finally {
    Pop-Location
}
