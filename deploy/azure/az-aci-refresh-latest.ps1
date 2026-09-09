param(
    [Parameter(Mandatory = $true)]
    [string]$ResourceGroup,

    [Parameter(Mandatory = $true)]
    [string]$ContainerGroup
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

if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $tmpFile)) {
    Write-Error "Failed to export container group config."
    exit 1
}

$yaml = Get-Content -LiteralPath $tmpFile -Raw

# Force first container image tag to :latest (keeps same registry/repository).
$pattern = '(?m)^(\s*image:\s*)([^\s]+)$'
$match = [regex]::Match($yaml, $pattern)
if (-not $match.Success) {
    Write-Error "Could not find image field in exported YAML."
    exit 1
}

$currentImage = $match.Groups[2].Value.Trim()
$repo = $currentImage
if ($currentImage.Contains("@")) {
    $repo = $currentImage.Split("@")[0]
}
if ($repo.Contains(":")) {
    $repo = $repo.Substring(0, $repo.LastIndexOf(":"))
}
$latestImage = "$repo`:latest"

$yaml = [regex]::Replace($yaml, $pattern, "`$1$latestImage", 1)
Set-Content -LiteralPath $tmpFile -Value $yaml -Encoding UTF8

Write-Host "[INFO] Current image: $currentImage"
Write-Host "[INFO] New image:     $latestImage"

Write-Host "[INFO] Deleting current container group..."
az container delete `
    --resource-group $ResourceGroup `
    --name $ContainerGroup `
    --yes

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to delete container group."
    exit $LASTEXITCODE
}

Write-Host "[INFO] Recreating container group from exported config..."
az container create `
    --resource-group $ResourceGroup `
    --file $tmpFile

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

