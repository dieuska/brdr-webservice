# BRDR Viewer

React + TypeScript viewer (OpenLayers) voor demo en alignering met BRDR.

## Overzicht
- Demo-kaartviewer met meerdere geometrieën (punt, lijn, polygoon).
- Selectie via lijst of via kaartklik.
- Aparte BRDR-alignment micro-frontend in iframe (`alignment-mfe.html`).
- Resultaat van `Aanpassen` wordt teruggestuurd en vervangt de geselecteerde geometrie in de demo.
- Demo CRS staat standaard op `EPSG:3812`.

## Workflow in de demo
1. Teken of importeer geometrieën in de demo-kaart.
2. Selecteer een geometrie.
3. Open de BRDR aligner.
4. Herbereken met gewenste settings.
5. Kies een prediction en klik `Aanpassen`.

## GRB visualisatie
- Basiskaarten:
  - GRB grijs (standaard aan)
  - GRB kleur (standaard uit)
  - OSM (standaard uit)
- OGC feature API overlays zijn dynamisch kiesbaar.
- OGC overlays zijn standaard uit en worden pas zichtbaar vanaf detailzoom (`minZoom`).

## Development

### Vereisten
- Node.js (>= 20 aanbevolen)
- npm

### Starten
```bash
npm install
npm run dev
```

Open: http://127.0.0.1:5173

### Build
```bash
npm run build
```

De build bevat twee entries:
- `index.html` (demo host)
- `alignment-mfe.html` (alignment micro-frontend)

## Backend koppeling
- Viewer gebruikt `POST /actualiser/viewer`.
- Standaard backend: `http://127.0.0.1:80`
- Override via `VITE_BRDR_API_BASE_URL`

Voorbeeld:
```bash
VITE_BRDR_API_BASE_URL=http://127.0.0.1:80 npm run dev
```
