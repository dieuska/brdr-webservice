# BRDR Webservice (Proof of Concept)
Webservice to align thematic features to GRB reference features, based on [brdr](https://github.com/OnroerendErfgoed/brdr).

## Documentation
- GitHub Pages: https://dieuska.github.io/brdr-webservice/
- Run locally guide: https://dieuska.github.io/brdr-webservice/run-locally.html
- API and viewer guide: https://dieuska.github.io/brdr-webservice/api-viewer.html

## Current Architecture
- Backend: FastAPI (`grb_webservice.py`) with `/actualiser` and `/actualiser/viewer`.
- Frontend: React + OpenLayers demo viewer (`brdr-viewer/brdr-viewer`).
- Alignment UI is separated as a reusable micro-frontend page (`alignment-mfe.html`) loaded in an iframe from the host demo.
- Build output contains both frontend entries:
  - `/viewer/index.html` (demo host)
  - `/viewer/alignment-mfe.html` (alignment micro-frontend)

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

## Frontend Build (manual)
```powershell
cd brdr-viewer\brdr-viewer
npm install
npm run build
```

## Quick Start (Docker)
```bash
docker build -f Dockerfile . -t grb_webservice
docker run --rm -p 80:80 --name grb_webservice grb_webservice
```

Docker image includes:
- backend API on `http://127.0.0.1:80`
- bundled viewer on `http://127.0.0.1:80/viewer`
- bundled alignment MFE on `http://127.0.0.1:80/viewer/alignment-mfe.html`

## Quick Check
```bash
curl -X GET http://127.0.0.1:80/ -H "accept: application/json"
```

## Local API Docs
- Swagger UI: http://127.0.0.1:80/docs

## Commit/Deploy Checklist
- Run frontend build: `npm run build` in `brdr-viewer/brdr-viewer`.
- Validate backend starts: `python grb_webservice.py`.
- Verify bundled viewer URL: `http://127.0.0.1:80/viewer`.
- Verify Docker image build succeeds with current `Dockerfile`.
