$ErrorActionPreference = "Stop"
Write-Host "VIGILAIR security checks"
if (-not (Test-Path .gitignore)) { throw ".gitignore missing" }
if (-not (Select-String -Path .gitignore -Pattern "^\.env$" -Quiet)) { throw ".env is not ignored" }
if (Test-Path .git) {
  $trackedSecrets = git ls-files | Select-String -Pattern "(^|/)(\.env|.*\.pem|.*\.key)$"
  if ($trackedSecrets) { throw "Potential secret files are tracked: $trackedSecrets" }
}
$unsafeRoutes = Select-String -Path backend\*.py -Pattern '@app\.(post|put|patch).*?(weapon|jammer|intercept|actuator|flight-control)' -CaseSensitive:$false
if ($unsafeRoutes) { throw "Forbidden physical-control route found: $unsafeRoutes" }
python -m compileall -q backend
Write-Host "Python compilation: PASS"
Write-Host "No physical-control modules are present in the backend contract."
