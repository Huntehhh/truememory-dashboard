# Shared bootstrap for the loop scripts.
# - Resolves the repo root relative to this script (no hardcoded paths).
# - Loads KEY=VALUE pairs from <repo>/.env into the process environment.
# Dot-source this at the top of each loop script:  . "$PSScriptRoot\_common.ps1"

$script:RepoRoot = Split-Path $PSScriptRoot -Parent

function Import-DotEnv {
    param([string]$Path = (Join-Path $script:RepoRoot ".env"))
    if (-not (Test-Path $Path)) {
        Write-Warning "No .env found at $Path — relying on existing environment."
        return
    }
    foreach ($line in Get-Content $Path) {
        $t = $line.Trim()
        if ($t -eq "" -or $t.StartsWith("#")) { continue }
        $idx = $t.IndexOf("=")
        if ($idx -lt 1) { continue }
        $k = $t.Substring(0, $idx).Trim()
        $v = $t.Substring($idx + 1).Trim()
        # Strip optional surrounding quotes
        if ($v.Length -ge 2 -and (($v[0] -eq '"' -and $v[-1] -eq '"') -or ($v[0] -eq "'" -and $v[-1] -eq "'"))) {
            $v = $v.Substring(1, $v.Length - 2)
        }
        Set-Item -Path "env:$k" -Value $v
    }
}

Import-DotEnv

# Log dir: <repo>/logs by default, override with TM_DASHBOARD_LOG_DIR.
$script:LogDir = if ($env:TM_DASHBOARD_LOG_DIR) { $env:TM_DASHBOARD_LOG_DIR } else { Join-Path $script:RepoRoot "logs" }
if (-not (Test-Path $script:LogDir)) { New-Item -ItemType Directory -Force -Path $script:LogDir | Out-Null }
