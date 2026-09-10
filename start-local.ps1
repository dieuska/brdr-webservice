param(
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $repoRoot "services\brdr-api\brdr_webservice.py"
$frontendPath = Join-Path $repoRoot "apps\brdr-viewers"
$venvPython = Join-Path $repoRoot "venv\Scripts\python.exe"
$preferredBackendPort = 80
$fallbackBackendPort = 8000

if (-not (Test-Path $backendPath)) {
    throw "Kon backend script niet vinden: $backendPath"
}

if (-not (Test-Path $frontendPath)) {
    throw "Kon viewer folder niet vinden: $frontendPath"
}

$pythonCmd = if (Test-Path $venvPython) { $venvPython } else { "python" }

function Test-PortInUse {
    param([int]$Port)

    $matches = netstat -ano | Select-String ":$Port "
    return $matches.Count -gt 0
}

$backendPort = $preferredBackendPort
if (Test-PortInUse -Port $preferredBackendPort) {
    $backendPort = $fallbackBackendPort
    Write-Warning "Poort $preferredBackendPort is al in gebruik. Backend start op fallbackpoort $backendPort."
}

$backendCommand = @(
    "Set-Location -LiteralPath '$repoRoot'"
    "`$env:BRDR_PORT='$backendPort'"
    "& '$pythonCmd' '$backendPath'"
) -join "; "

$frontendCommand = @(
    "Set-Location -LiteralPath '$frontendPath'"
    "if (-not (Test-Path 'node_modules')) { npm install }"
    "`$env:VITE_BRDR_API_BASE_URL='http://127.0.0.1:$backendPort'"
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

if ($backendPort -ne $preferredBackendPort) {
    Write-Host "Opgelet: poort 80 was bezet, backend draait op http://127.0.0.1:$backendPort"
} else {
    Write-Host "Backend gestart op http://127.0.0.1:$backendPort"
}
Write-Host "Viewer gestart op http://127.0.0.1:5173"

