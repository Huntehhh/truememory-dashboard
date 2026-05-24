# Materialized-view refresher — restart-on-crash loop.
# Refreshes the 3 memory matviews every MATVIEW_REFRESH_MS (default 30s).
# Optional: the mirror can also refresh after each batch; running this loop
# guarantees fresh views even when the mirror is idle.
. "$PSScriptRoot\_common.ps1"

$log = Join-Path $script:LogDir "refresh.log"
Set-Location $script:RepoRoot

while ($true) {
    "[{0}] starting matview refresher..." -f (Get-Date -Format o) | Tee-Object -FilePath $log -Append
    node dist/refresh/matviews.js *>> $log
    "[{0}] refresher exited (code $LASTEXITCODE) — restarting in 10s" -f (Get-Date -Format o) | Tee-Object -FilePath $log -Append
    Start-Sleep -Seconds 10
}
