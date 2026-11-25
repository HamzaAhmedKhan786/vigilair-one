$ErrorActionPreference = "Stop"
Write-Host "VIGILAIR security checks"
if (-not (Test-Path .gitignore)) { throw ".gitignore missing" }
git check-ignore -q -- .env
if ($LASTEXITCODE -ne 0) { throw ".env must be ignored and untracked" }
$tracked = git ls-files
if ($LASTEXITCODE -ne 0) { throw "Cannot inspect the Git index" }
$trackedSecrets = $tracked | Where-Object {
    $_ -match '(^|/)(\.env($|\.)|.*\.(pem|key|pfx|p12)$)' -and $_ -notmatch '(^|/)\.env\.example$'
}
if ($trackedSecrets) { throw "Potential secret files are tracked: $trackedSecrets" }
$patterns = '-----BEGIN ([A-Z]+ )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16}'
$matchesInIndex = git grep --cached -IlE -e $patterns
if ($LASTEXITCODE -gt 1) { throw "Git credential pattern scan failed" }
if ($matchesInIndex) { throw "Review potential credentials in indexed files: $matchesInIndex" }
$unsafeRoutes = Select-String -Path backend\*.py -Pattern '@app\.(post|put|patch).*?(weapon|jammer|intercept|actuator|flight-control)' -CaseSensitive:$false
if ($unsafeRoutes) { throw "Forbidden physical-control route found: $unsafeRoutes" }
Write-Host "Git index credential patterns and inline physical-control route patterns: PASS"
