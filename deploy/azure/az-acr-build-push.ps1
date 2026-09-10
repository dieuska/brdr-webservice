param(
    [Parameter(Mandatory = $true)]
    [string]$ResourceGroup,

    [Parameter(Mandatory = $true)]
    [string]$AcrName,

    [Parameter(Mandatory = $true)]
    [string]$ImageName,

    [string]$Tag = "latest",

    [string]$Dockerfile = "Dockerfile"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
Set-Location -LiteralPath $repoRoot

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Error "Azure CLI az is not installed or not in PATH."
    exit 1
}

try {
    az account show | Out-Null
}
catch {
    Write-Error "Not logged in. Run: az login"
    exit 1
}

try {
    $acrLoginServer = az acr show `
        --name $AcrName `
        --resource-group $ResourceGroup `
        --query "loginServer" `
        --output tsv
}
catch {
    Write-Error "Could not resolve ACR login server for '$AcrName' in resource group '$ResourceGroup'."
    exit 1
}

if ([string]::IsNullOrWhiteSpace($acrLoginServer)) {
    Write-Error "Could not resolve ACR login server for '$AcrName'."
    exit 1
}

Write-Host "[INFO] Building and pushing image with Azure ACR Build..."
Write-Host "[INFO] Registry: $AcrName"
Write-Host "[INFO] Image:    $ImageName`:$Tag"
Write-Host "[INFO] Context:  $repoRoot"
Write-Host "[INFO] File:     $Dockerfile"

$contextPath = Join-Path $env:TEMP "brdr-acr-context-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $contextPath -Force | Out-Null

try {
    # Keep the ACR upload context limited to what Dockerfile actually copies.
    # This avoids broken junctions, caches and the optional MapStore tree.
    Copy-Item -LiteralPath (Join-Path $repoRoot $Dockerfile) -Destination (Join-Path $contextPath "Dockerfile")
    New-Item -ItemType Directory -Path (Join-Path $contextPath "apps") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $contextPath "services") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $contextPath "apps\brdr-viewers") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $contextPath "services\brdr-api") -Force | Out-Null

    & robocopy (Join-Path $repoRoot "apps\brdr-viewers") (Join-Path $contextPath "apps\brdr-viewers") /E /XD node_modules dist .vite /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -gt 7) { throw "Kon apps/brdr-viewers niet naar de tijdelijke build-context kopiëren." }
    & robocopy (Join-Path $repoRoot "services\brdr-api") (Join-Path $contextPath "services\brdr-api") /E /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -gt 7) { throw "Kon services/brdr-api niet naar de tijdelijke build-context kopiëren." }

    Push-Location -LiteralPath $contextPath
    try {
        az acr build `
            --registry $AcrName `
            --resource-group $ResourceGroup `
            --image "$ImageName`:$Tag" `
            --file Dockerfile `
            .
    }
    finally {
        Pop-Location
    }
}
finally {
    if (Test-Path -LiteralPath $contextPath) {
        Remove-Item -LiteralPath $contextPath -Recurse -Force -ErrorAction SilentlyContinue
    }
}

if ($LASTEXITCODE -ne 0) {
    Write-Error "az acr build failed."
    exit $LASTEXITCODE
}

Write-Host "[OK] Image pushed: $acrLoginServer/$ImageName`:$Tag"
