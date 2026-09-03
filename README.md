# BRDR Webservice (Proof of Concept)
Webservice to align thematic features to GRB reference features, based on [brdr](https://github.com/OnroerendErfgoed/brdr).

## Documentation
- GitHub Pages: https://dieuska.github.io/brdr-webservice/
- Run locally guide: https://dieuska.github.io/brdr-webservice/run-locally.html
- API and viewer guide: https://dieuska.github.io/brdr-webservice/api-viewer.html
- MFE integration guide: https://dieuska.github.io/brdr-webservice/mfe-integration.html

## Current Architecture
- Backend: FastAPI (`brdr_webservice.py`) with one alignment endpoint: `/aligner`.
- `/aligner` supports optional feature metadata in `properties` for lifecycle-driven evaluation.
- Frontend: React + OpenLayers app (`brdr-viewer/brdr-viewer`) with two distinct frontend roles:
  - **Host viewers**: demo apps with their own map, geometry selection, import/export, and embedded BRDR alignment
  - **BRDR alignment MFE's**: reusable alignment micro-frontends for embedding in another host application

### Frontend Routes

Host viewers:
- `/grb-viewer` (GRB demo host)
- `/brk-viewer` (BRK/WFS demo host)

Reusable BRDR alignment MFE's:
- `/alignment-mfe.html` (GRB alignment micro-frontend, full workflow)
- `/alignment-mfe-simple.html` (GRB alignment micro-frontend, compact workflow)
- `/alignment-mfe-wfs.html` (BRK/WFS alignment micro-frontend, full workflow)
- `/alignment-mfe-wfs-simple.html` (BRK/WFS alignment micro-frontend, compact workflow)

Landing page:
- `/` overview page linking to host viewers, MFE variants, and backend docs

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
docker build -f Dockerfile . -t brdr-aligner
docker run --rm -p 80:80 --name brdr-aligner brdr-aligner
```

Docker image includes:
- backend API on `http://127.0.0.1:80`
- bundled frontend landing page on `http://127.0.0.1:80/`
- bundled host viewers on `http://127.0.0.1:80/grb-viewer` and `http://127.0.0.1:80/brk-viewer`
- bundled BRDR alignment MFE's on:
  - `http://127.0.0.1:80/alignment-mfe.html`
  - `http://127.0.0.1:80/alignment-mfe-simple.html`
  - `http://127.0.0.1:80/alignment-mfe-wfs.html`
  - `http://127.0.0.1:80/alignment-mfe-wfs-simple.html`

## Quick Check
```bash
curl -X GET http://127.0.0.1:80/ -H "accept: application/json"
```

## Local API Docs
- Swagger UI: http://127.0.0.1:80/docs

## Commit/Deploy Checklist
- Run frontend build: `npm run build` in `brdr-viewer/brdr-viewer`.
- Validate backend starts: `python brdr_webservice.py`.
- Verify bundled viewer URL: `http://127.0.0.1:80/`.
- Verify required host viewer and MFE URLs resolve after deploy.
- Verify Docker image build succeeds with current `Dockerfile`.








