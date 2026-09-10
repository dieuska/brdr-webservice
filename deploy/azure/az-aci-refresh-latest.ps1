param(
    [Parameter(Mandatory = $true)]
    [string]$ResourceGroup,

    [Parameter(Mandatory = $true)]
    [string]$ContainerGroup,

    [string]$RegistryUsername = "",
    [string]$RegistryPassword = "",
    [switch]$PromptForRegistryPassword,
    [string]$ImageTag = "latest",
    [string]$ImageName = ""
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Error "Azure CLI (az) is not installed or not in PATH."
    exit 1
}

try {
    az account show | Out-Null
}
catch {
    Write-Error "Not logged in. Run: az login"
    exit 1
}

$tmpFile = Join-Path $env:TEMP "$ContainerGroup-aci-refresh.yaml"

Write-Host "[INFO] Exporting current ACI config..."
az container export `
    --resource-group $ResourceGroup `
    --name $ContainerGroup `
    --file $tmpFile

if ($LASTEXITCODE -ne 0 -and -not (Test-Path -LiteralPath $tmpFile)) {
    Write-Error "Failed to export container group config."
    exit 1
}
if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] Export failed; using the previously saved export: $tmpFile"
}

$yaml = Get-Content -LiteralPath $tmpFile -Raw

# Azure CLI versions export ACI definitions as either YAML or JSON. Support
# both formats and locate the first container image in the exported config.
$jsonExport = $null
try { $jsonExport = $yaml | ConvertFrom-Json -ErrorAction Stop } catch { }
$currentImage = $null
if ($null -ne $jsonExport) {
    $container = @($jsonExport.properties.containers)[0]
    if ($null -eq $container) { $container = @($jsonExport.containers)[0] }
    $currentImage = $container.properties.image
}
if ([string]::IsNullOrWhiteSpace($currentImage)) {
    $yamlPattern = '(?m)^\s*image:\s*["'']?([^\s"'']+)["'']?\s*$'
    $yamlMatch = [regex]::Match($yaml, $yamlPattern)
    if ($yamlMatch.Success) { $currentImage = $yamlMatch.Groups[1].Value.Trim() }
}
if ([string]::IsNullOrWhiteSpace($currentImage)) {
    Write-Error "Could not find image field in exported container configuration."
    exit 1
}

$registryServer = ($currentImage -split "/")[0]
$repo = $currentImage
if ($currentImage.Contains("@")) {
    $repo = $currentImage.Split("@")[0]
}
if ($repo.Contains(":")) {
    $repo = $repo.Substring(0, $repo.LastIndexOf(":"))
}
if (-not [string]::IsNullOrWhiteSpace($ImageName)) {
    $repo = "$registryServer/$ImageName"
}
$latestImage = "$repo`:$ImageTag"

$yaml = if ($null -ne $jsonExport) {
    $container = @($jsonExport.properties.containers)[0]
    if ($null -eq $container) { $container = @($jsonExport.containers)[0] }
    $container.properties.image = $latestImage
    $jsonExport.properties.PSObject.Properties.Remove("isCustomProvisioningTimeout")
    $jsonExport.properties.PSObject.Properties.Remove("provisioningTimeoutInSeconds")
    $jsonExport.properties.PSObject.Properties.Remove("imageRegistryCredentials")
    $jsonExport | ConvertTo-Json -Depth 20
} else {
    $updatedYaml = [regex]::Replace($yaml, '(?m)^(\s*image:\s*["'']?)[^\s"'']+(["'']?\s*)$', "`$1$latestImage`$2", 1)
    $withoutTimeout = [regex]::Replace($updatedYaml, '(?m)^\s*(isCustomProvisioningTimeout|provisioningTimeoutInSeconds):[^\r\n]*(\r?\n|$)', '')
    [regex]::Replace($withoutTimeout, '(?ms)^  imageRegistryCredentials:.*?(?=^  initContainers:)', '')
}
Set-Content -LiteralPath $tmpFile -Value $yaml -Encoding UTF8

Write-Host "[INFO] Current image: $currentImage"
Write-Host "[INFO] New image:     $latestImage"

Write-Host "[INFO] Deleting current container group..."
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
az container show --resource-group $ResourceGroup --name $ContainerGroup --output none 2>$null
$containerExists = $LASTEXITCODE -eq 0
$ErrorActionPreference = $previousErrorActionPreference
if ($containerExists) {
    az container delete `
        --resource-group $ResourceGroup `
        --name $ContainerGroup `
        --yes

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to delete container group."
        exit $LASTEXITCODE
    }
} else {
    Write-Host "[INFO] Container group is already absent; recreating it directly."
}

Write-Host "[INFO] Recreating container group from exported config..."
$registryName = ($registryServer -split "\.")[0]
if ([string]::IsNullOrWhiteSpace($RegistryUsername)) {
    $RegistryUsername = az acr credential show --name $registryName --query "username" --output tsv
}
if ($PromptForRegistryPassword) {
    $secureRegistryPassword = Read-Host "ACR registry password" -AsSecureString
    $RegistryPassword = [System.Net.NetworkCredential]::new("", $secureRegistryPassword).Password
} elseif ([string]::IsNullOrWhiteSpace($RegistryPassword)) {
    $RegistryPassword = az acr credential show --name $registryName --query "passwords[0].value" --output tsv
}
if ([string]::IsNullOrWhiteSpace($RegistryUsername) -or [string]::IsNullOrWhiteSpace($RegistryPassword)) {
    Write-Error "Could not retrieve ACR credentials for '$registryName'. Ensure the ACR admin user is enabled."
    exit 1
}

az container create `
    --resource-group $ResourceGroup `
    --file $tmpFile `
    --registry-login-server $registryServer `
    --registry-username $RegistryUsername `
    --registry-password $RegistryPassword

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to recreate container group."
    exit $LASTEXITCODE
}

$result = az container show `
    --resource-group $ResourceGroup `
    --name $ContainerGroup `
    --query "{fqdn:ipAddress.fqdn,image:containers[0].image}" `
    --output tsv

Write-Host "[OK] Refreshed container group."
Write-Host "[OK] $result"
