param(
    [Parameter(Mandatory = $true)][string]$ResourceGroup,
    [Parameter(Mandatory = $true)][string]$RegistryName,
    [string]$Location = "westeurope",
    [string]$EnvironmentName = "brdr-demo-env",
    [string]$BrdrAppName = "brdr-api-demo",
    [string]$MapStoreAppName = "brdr-mapstore-demo"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$mapStoreRoot = Join-Path $repoRoot "mapstore-brdr-demo"

az group create --name $ResourceGroup --location $Location | Out-Null
az acr create --resource-group $ResourceGroup --name $RegistryName --sku Basic --location $Location | Out-Null
az acr build --registry $RegistryName --image "brdr-api-demo:latest" $repoRoot

$registryLoginServer = az acr show --name $RegistryName --query loginServer -o tsv
$registryUser = az acr credential show --name $RegistryName --query username -o tsv
$registryPassword = az acr credential show --name $RegistryName --query "passwords[0].value" -o tsv

az containerapp env create --name $EnvironmentName --resource-group $ResourceGroup --location $Location | Out-Null
az containerapp create `
    --name $BrdrAppName `
    --resource-group $ResourceGroup `
    --environment $EnvironmentName `
    --image "$registryLoginServer/brdr-api-demo:latest" `
    --target-port 80 --ingress external `
    --registry-server $registryLoginServer `
    --registry-username $registryUser --registry-password $registryPassword | Out-Null

$brdrFqdn = az containerapp show --name $BrdrAppName --resource-group $ResourceGroup --query properties.configuration.ingress.fqdn -o tsv

if (-not (Test-Path (Join-Path $mapStoreRoot "dist"))) {
    throw "mapstore-brdr-demo/dist ontbreekt. Voer eerst 'npm run compile' uit in $mapStoreRoot."
}

$brdrApiUrl = "https://$brdrFqdn"
az acr build --registry $RegistryName --image "brdr-mapstore-demo:latest" --build-arg "BRDR_API_URL=$brdrApiUrl" $mapStoreRoot
az containerapp create `
    --name $MapStoreAppName `
    --resource-group $ResourceGroup `
    --environment $EnvironmentName `
    --image "$registryLoginServer/brdr-mapstore-demo:latest" `
    --target-port 80 --ingress external `
    --registry-server $registryLoginServer `
    --registry-username $registryUser --registry-password $registryPassword | Out-Null

$mapStoreFqdn = az containerapp show --name $MapStoreAppName --resource-group $ResourceGroup --query properties.configuration.ingress.fqdn -o tsv
az containerapp update `
    --name $BrdrAppName `
    --resource-group $ResourceGroup `
    --set-env-vars "BRDR_CORS_ORIGINS=https://$mapStoreFqdn" | Out-Null

Write-Host "MapStore: https://$mapStoreFqdn"
Write-Host "BRDR/API: https://$brdrFqdn"
