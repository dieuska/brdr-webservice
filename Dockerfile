FROM node:20-bookworm-slim AS viewer-build

WORKDIR /app/viewer
COPY apps/brdr-viewers/package.json apps/brdr-viewers/package-lock.json ./
RUN npm ci
COPY apps/brdr-viewers/ ./
RUN npm run build

FROM python:3.12-slim

WORKDIR /app
RUN python -m pip install --upgrade pip
RUN python -m pip install fastapi uvicorn brdr==0.17.3 shapely pydantic geojson_pydantic

COPY services/brdr-api/brdr_webservice.py brdr_webservice.py
COPY services/brdr-api/brdr_webservice_typings.py brdr_webservice_typings.py
COPY --from=viewer-build /app/viewer/dist ./frontend_dist

EXPOSE 80
ENTRYPOINT ["python", "brdr_webservice.py"]

