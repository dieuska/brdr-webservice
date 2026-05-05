param(
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $repoRoot "brdr_webservice.py"
$frontendPath = Join-Path $repoRoot "brdr-viewer\brdr-viewer"
$venvPython = Join-Path $repoRoot "venv\Scripts\python.exe"

if (-not (Test-Path $backendPath)) {
    throw "Kon backend script niet vinden: $backendPath"
}

if (-not (Test-Path $frontendPath)) {
    throw "Kon viewer folder niet vinden: $frontendPath"
}

$pythonCmd = if (Test-Path $venvPython) { $venvPython } else { "python" }

$backendCommand = @(
    "Set-Location -LiteralPath '$repoRoot'"
    "& '$pythonCmd' '$backendPath'"
) -join "; "

$frontendCommand = @(
    "Set-Location -LiteralPath '$frontendPath'"
    "if (-not (Test-Path 'node_modules')) { npm install }"
    "npm run dev -- --host 127.0.0.1 --port 5173"
) -join "; "

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    $backendCommand
) | Out-Null

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    $frontendCommand
) | Out-Null

if (-not $NoBrowser) {
    Start-Sleep -Seconds 3
    Start-Process "http://127.0.0.1:5173"
}

Write-Host "Backend gestart op http://127.0.0.1:80"
Write-Host "Viewer gestart op http://127.0.0.1:5173"

