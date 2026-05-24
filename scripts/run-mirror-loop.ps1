# TrueMemory mirror — restart-on-crash loop.
# Reads the local TrueMemory SQLite store and syncs tm_* tables into Postgres
# (writer role). Internal cadence is TM_MIRROR_POLL_MS (default 5 min).
. "$PSScriptRoot\_common.ps1"

$log = Join-Path $script:LogDir "mirror.log"
Set-Location $script:RepoRoot

while ($true) {
    "[{0}] starting mirror..." -f (Get-Date -Format o) | Tee-Object -FilePath $log -Append
    node dist/mirror/truememory.js *>> $log
    "[{0}] mirror exited (code $LASTEXITCODE) — restarting in 10s" -f (Get-Date -Format o) | Tee-Object -FilePath $log -Append
    Start-Sleep -Seconds 10
}
