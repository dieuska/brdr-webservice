FROM node:20-bookworm-slim AS viewer-build

WORKDIR /app/viewer
COPY brdr-viewer/brdr-viewer/package.json brdr-viewer/brdr-viewer/package-lock.json ./
RUN npm ci
COPY brdr-viewer/brdr-viewer/ ./
RUN npm run build

FROM python:3.12-slim

WORKDIR /app
RUN python -m pip install --upgrade pip
RUN python -m pip install fastapi uvicorn brdr==0.16.0 shapely pydantic geojson_pydantic

COPY grb_webservice.py grb_webservice.py
COPY grb_webservice_typings.py grb_webservice_typings.py
COPY --from=viewer-build /app/viewer/dist ./frontend_dist

EXPOSE 80
ENTRYPOINT ["python", "grb_webservice.py"]
