$ErrorActionPreference = "Stop"
python -m compileall -q backend tests scripts
python -m pytest tests -q
npm run build
& $PSScriptRoot\security_check.ps1
Write-Host "VIGILAIR verification: PASS"
