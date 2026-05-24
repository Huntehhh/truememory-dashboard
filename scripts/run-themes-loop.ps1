# Themes (UMAP) recompute — 1-hour cadence loop. OPTIONAL.
# Only needed for the Themes (UMAP) dashboard page. Requires Python with
# numpy, psycopg, umap-learn, scikit-learn installed.
. "$PSScriptRoot\_common.ps1"

$log = Join-Path $script:LogDir "themes.log"
$python = if ($env:PYTHON_EXE) { $env:PYTHON_EXE } else { "python" }
Set-Location $script:RepoRoot

$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"

while ($true) {
    "[{0}] computing themes..." -f (Get-Date -Format o) | Tee-Object -FilePath $log -Append
    & $python src/themes/compute_umap.py --once *>> $log
    "[{0}] themes pass done (code $LASTEXITCODE) — sleeping 1h" -f (Get-Date -Format o) | Tee-Object -FilePath $log -Append
    Start-Sleep -Seconds 3600
}
