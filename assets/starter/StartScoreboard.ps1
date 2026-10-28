param(
    [ValidateSet('Local','LAN')][string]$Mode = 'Local',
    [ValidateRange(1,65535)][int]$Port = 8787
)
$ErrorActionPreference = 'Stop'
$scoreNode = Get-Command node -ErrorAction Stop
$scoreNodeVersion = & $scoreNode.Source --version
if ($LASTEXITCODE -ne 0 -or $scoreNodeVersion -notmatch '^v(\d+)\.') { throw 'Cannot determine Node.js version.' }
if ([int]$Matches[1] -lt 20) { throw 'Node.js 20 or newer is required.' }
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'seed.json'))) { throw 'seed.json is missing.' }
$scoreOldHost = $env:HOST
$scoreOldPort = $env:PORT
$scoreOldData = $env:SCORE_DATA_DIR
try {
    $env:HOST = if ($Mode -eq 'LAN') { '0.0.0.0' } else { '127.0.0.1' }
    $env:PORT = [string]$Port
    $env:SCORE_DATA_DIR = Join-Path $PSScriptRoot 'data'
    Write-Host ('Mode: ' + $Mode + ' / Port: ' + $Port)
    Write-Host 'Private entry links are stored in data/private-links.txt. Do not publish this file.'
    Write-Host 'Keep this window running. Press Ctrl+C to stop this instance.'
    & $scoreNode.Source (Join-Path $PSScriptRoot 'server.mjs')
    if ($LASTEXITCODE -ne 0) { throw ('Server exited: ' + $LASTEXITCODE) }
} finally {
    $env:HOST = $scoreOldHost
    $env:PORT = $scoreOldPort
    $env:SCORE_DATA_DIR = $scoreOldData
}
