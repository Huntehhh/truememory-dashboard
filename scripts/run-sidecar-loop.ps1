# Simulator sidecar (FastAPI + uvicorn) - restart-on-crash loop.
# Serves /health, /simulate, /events (SSE), /curation/*, /directives/* on
# 127.0.0.1:8504 for the dashboard's /api/sim/* pass-through.
#
# Launch form is the ONLY ASR-safe path: python -m uvicorn ... via the signed
# S:\LIBRARIES\Python313\python.exe. Do not call uvicorn.exe directly.
. "$PSScriptRoot\_common.ps1"

$log = Join-Path $script:LogDir "sidecar.log"
$py = if ($env:TM_SIDECAR_PYTHON) { $env:TM_SIDECAR_PYTHON } else { "S:\LIBRARIES\Python313\python.exe" }
$appDir = Join-Path $script:RepoRoot "sidecar"
$sidecarHost = if ($env:TM_SIDECAR_HOST) { $env:TM_SIDECAR_HOST } else { "127.0.0.1" }
$port = if ($env:TM_SIDECAR_PORT) { $env:TM_SIDECAR_PORT } else { "8504" }

Set-Location $script:RepoRoot

while ($true) {
    "[{0}] starting sidecar on {1}:{2} (app-dir={3})..." -f (Get-Date -Format o), $sidecarHost, $port, $appDir |
        Tee-Object -FilePath $log -Append
    & $py -m uvicorn tm_sidecar.app:app `
        --host $sidecarHost `
        --port $port `
        --app-dir $appDir `
        *>> $log
    "[{0}] sidecar exited (code $LASTEXITCODE) - restarting in 10s" -f (Get-Date -Format o) |
        Tee-Object -FilePath $log -Append
    Start-Sleep -Seconds 10
}
