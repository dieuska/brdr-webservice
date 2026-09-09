## Build and Push to Azure ACR
Use the helper script from repo root:

```cmd
deploy\azure\az-acr-build-push.cmd <resource-group> <acr-name> <image-name> [tag] [dockerfile]
```

Or in PowerShell:

```powershell
.\deploy\azure\az-acr-build-push.ps1 -ResourceGroup <resource-group> -AcrName <acr-name> -ImageName <image-name> -Tag latest -Dockerfile Dockerfile
```

Example:

```cmd
deploy\azure\az-acr-build-push.cmd my-rg myacr grb-webservice latest Dockerfile
```

This uses `az acr build`, so build and push happen directly in ACR.

Local build + push (useful if ACR cloud build hits Docker Hub rate limits):

```cmd
deploy\azure\az-acr-local-build-push.cmd <acr-name> <image-name> [tag] [dockerfile]
```

PowerShell variant:

```powershell
.\deploy\azure\az-acr-local-build-push.ps1 -AcrName <acr-name> -ImageName <image-name> -Tag latest -Dockerfile Dockerfile
```

## One-step Azure Deploy (recommended)

Use the new script with a settings file so you do not need to pass resource names every time.

1. Copy and fill settings:

```powershell
Copy-Item .\deploy\azure\azure-deploy.settings.ps1.example .\deploy\azure\azure-deploy.settings.ps1
notepad .\deploy\azure\azure-deploy.settings.ps1
```

Set at least:
- `SubscriptionId`
- `ResourceGroup`
- `AcrName`
- `ImageName`
- `WebAppName` (for webapp target) or `ContainerAppName` (for containerapp target)

2. Deploy:

```cmd
deploy\azure\az-deploy.cmd -Target webapp
```

Or:

```cmd
deploy\azure\az-deploy.cmd -Target containerapp
```

PowerShell variant:

```powershell
.\deploy\azure\az-deploy.ps1 -Target webapp
```

## Refresh Azure Container Instance to latest image

Reuses current container group config (including DNS label/FQDN), forces image tag to `latest`, then recreates ACI.

```cmd
deploy\azure\az-aci-refresh-latest.cmd -ResourceGroup <resource-group> -ContainerGroup <container-group>
```

PowerShell variant:

```powershell
.\deploy\azure\az-aci-refresh-latest.ps1 -ResourceGroup <resource-group> -ContainerGroup <container-group>
```
