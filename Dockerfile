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

COPY brdr_webservice.py brdr_webservice.py
COPY brdr_webservice_typings.py brdr_webservice_typings.py
COPY --from=viewer-build /app/viewer/dist ./frontend_dist

EXPOSE 80
ENTRYPOINT ["python", "brdr_webservice.py"]

