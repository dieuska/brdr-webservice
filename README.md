# BRDR Webservice (Proof of Concept)
Webservice to align thematic features to GRB reference features, based on [brdr](https://github.com/OnroerendErfgoed/brdr).

## Documentation
- GitHub Pages: https://dieuska.github.io/brdr-webservice/
- Run locally guide: https://dieuska.github.io/brdr-webservice/run-locally.html
- API and viewer guide: https://dieuska.github.io/brdr-webservice/api-viewer.html

## Quick Start (Local)
```powershell
.\start-local.ps1
```

Or:

```cmd
start-local.cmd
```

Then open:
- Viewer (dev): http://127.0.0.1:5173
- API docs: http://127.0.0.1:80/docs


## Quick Start (Docker)
```bash
docker build -f Dockerfile . -t grb_webservice
docker run --rm -p 80:80 --name grb_webservice grb_webservice
```

Docker image includes:
- backend API on `http://127.0.0.1:80`
- bundled viewer on `http://127.0.0.1:80/viewer`

## Quick Check
```bash
curl -X GET http://127.0.0.1:80/ -H "accept: application/json"
```

## Local API Docs
- Swagger UI: http://127.0.0.1:80/docs
