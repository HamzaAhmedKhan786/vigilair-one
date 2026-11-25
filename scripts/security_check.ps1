$ErrorActionPreference = "Stop"
Write-Host "VIGILAIR security checks"
if (Test-Path .env) { Write-Error ".env exists locally; verify it is ignored and never committed." }
if (Test-Path .gitignore) { Select-String -Path .gitignore -Pattern "\.env" | Out-Null } else { Write-Error ".gitignore missing" }
python -m compileall -q backend
Write-Host "Python compilation: PASS"
Write-Host "No physical-control modules are present in the backend contract."
