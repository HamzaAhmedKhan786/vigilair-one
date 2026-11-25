$ErrorActionPreference = "Stop"
Push-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
try {
    $python = if (Test-Path .venv\Scripts\python.exe) { ".\.venv\Scripts\python.exe" } else { "python" }
    & $python -m compileall -q backend tests scripts
    if ($LASTEXITCODE -ne 0) { throw "Python compilation failed" }
    & $python -m pytest tests -q
    if ($LASTEXITCODE -ne 0) { throw "Backend tests failed" }
    npm test
    if ($LASTEXITCODE -ne 0) { throw "Frontend tests failed" }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
    & "$PSScriptRoot\security_check.ps1"
    Write-Host "VIGILAIR verification: PASS"
} finally {
    Pop-Location
}
