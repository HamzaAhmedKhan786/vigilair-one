$ErrorActionPreference = "Stop"
Push-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
try {
    $python = if ($env:VIGILAIR_PYTHON) { $env:VIGILAIR_PYTHON } elseif (Test-Path .venv\Scripts\python.exe) { ".\.venv\Scripts\python.exe" } else { "python" }
    & $python -m compileall -q backend tests scripts
    if ($LASTEXITCODE -ne 0) { throw "Python compilation failed" }
    $testTemp = Join-Path (Get-Location).Path 'artifacts\pytest-verify'
    $resolvedWorkspace = (Get-Location).Path.TrimEnd('\') + '\'
    if (-not $testTemp.StartsWith($resolvedWorkspace, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Pytest temporary path escaped workspace' }
    & $python -m pytest tests -q --basetemp $testTemp
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
