param(
    [ValidateSet("webapp", "containerapp")]
    [string]$Target = "webapp",

    [string]$SettingsFile = "$PSScriptRoot\azure-deploy.settings.ps1"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $SettingsFile)) {
    Write-Error "Settings file not found: $SettingsFile. Copy azure-deploy.settings.ps1.example first."
    exit 1
}

. $SettingsFile

function Require-Value {
    param(
        [string]$Name,
        [string]$Value
    )
    if ([string]::IsNullOrWhiteSpace($Value)) {
        Write-Error "Missing required setting: $Name"
        exit 1
    }
}

Require-Value -Name "ResourceGroup" -Value $ResourceGroup
Require-Value -Name "AcrName" -Value $AcrName
Require-Value -Name "ImageName" -Value $ImageName

if ($Target -eq "webapp") {
    Require-Value -Name "WebAppName" -Value $WebAppName
}
if ($Target -eq "containerapp") {
    Require-Value -Name "ContainerAppName" -Value $ContainerAppName
}

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Error "Azure CLI (az) not found in PATH."
    exit 1
}

if (-not $UseAcrBuild -and -not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker not found in PATH (required for local build mode)."
    exit 1
}

try {
    az account show | Out-Null
}
catch {
    Write-Error "Not logged in. Run: az login"
    exit 1
}

if (-not [string]::IsNullOrWhiteSpace($SubscriptionId)) {
    az account set --subscription $SubscriptionId | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to set subscription: $SubscriptionId"
        exit $LASTEXITCODE
    }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location -LiteralPath $repoRoot

$acrLoginServer = az acr show `
    --name $AcrName `
    --resource-group $ResourceGroup `
    --query "loginServer" `
    --output tsv

if ([string]::IsNullOrWhiteSpace($acrLoginServer)) {
    Write-Error "Could not resolve loginServer for ACR '$AcrName' in '$ResourceGroup'."
    exit 1
}

$fullImage = "$acrLoginServer/$ImageName`:$Tag"

Write-Host "[INFO] Target:      $Target"
Write-Host "[INFO] Repo root:   $repoRoot"
Write-Host "[INFO] Registry:    $AcrName ($acrLoginServer)"
Write-Host "[INFO] Image:       $fullImage"
Write-Host "[INFO] Dockerfile:  $Dockerfile"
Write-Host "[INFO] UseAcrBuild: $UseAcrBuild"

if ($UseAcrBuild) {
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
}
else {
    az acr login --name $AcrName
    if ($LASTEXITCODE -ne 0) {
        Write-Error "az acr login failed."
        exit $LASTEXITCODE
    }

    docker build -f $Dockerfile -t $fullImage .
    if ($LASTEXITCODE -ne 0) {
        Write-Error "docker build failed."
        exit $LASTEXITCODE
    }

    docker push $fullImage
    if ($LASTEXITCODE -ne 0) {
        Write-Error "docker push failed."
        exit $LASTEXITCODE
    }
}

if ($Target -eq "webapp") {
    Write-Host "[INFO] Deploying to Azure Web App: $WebAppName"

    az webapp config container set `
        --name $WebAppName `
        --resource-group $ResourceGroup `
        --container-image-name $fullImage `
        --container-registry-url "https://$acrLoginServer"

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to configure Web App container image."
        exit $LASTEXITCODE
    }

    az webapp restart `
        --name $WebAppName `
        --resource-group $ResourceGroup | Out-Null

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to restart Web App."
        exit $LASTEXITCODE
    }
}

if ($Target -eq "containerapp") {
    Write-Host "[INFO] Deploying to Azure Container App: $ContainerAppName"

    az containerapp update `
        --name $ContainerAppName `
        --resource-group $ResourceGroup `
        --image $fullImage

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to update Container App image."
        exit $LASTEXITCODE
    }
}

Write-Host "[OK] Deploy finished: $fullImage"
