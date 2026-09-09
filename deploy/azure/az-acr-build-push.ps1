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

az acr build `
    --registry $AcrName `
    --resource-group $ResourceGroup `
    --image "$ImageName`:$Tag" `
    --file $Dockerfile `
    .

if ($LASTEXITCODE -ne 0) {
    Write-Error "az acr build failed."
    exit $LASTEXITCODE
}

Write-Host "[OK] Image pushed: $acrLoginServer/$ImageName`:$Tag"
