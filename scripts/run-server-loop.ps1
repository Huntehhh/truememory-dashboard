# Dashboard HTTP server — restart-on-crash loop.
# Serves the dashboard + /api/memory on 127.0.0.1:8503 (read-only PG role).
. "$PSScriptRoot\_common.ps1"

$log = Join-Path $script:LogDir "server.log"
Set-Location $script:RepoRoot

while ($true) {
    "[{0}] starting server..." -f (Get-Date -Format o) | Tee-Object -FilePath $log -Append
    node dist/server/index.js *>> $log
    "[{0}] server exited (code $LASTEXITCODE) — restarting in 10s" -f (Get-Date -Format o) | Tee-Object -FilePath $log -Append
    Start-Sleep -Seconds 10
}
