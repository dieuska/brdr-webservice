# BRDR Viewer

React + TypeScript viewer (OpenLayers) voor demo en alignering met BRDR.

## Overzicht
- Demo-kaartviewer met meerdere geometrieën (punt, lijn, polygoon).
- Selectie via lijst of via kaartklik.
- Aparte BRDR-alignment micro-frontend in iframe (`alignment-mfe.html` voor GRB, `alignment-mfe-wfs.html` voor BRK/WFS).
- Resultaat van `Aanpassen` wordt teruggestuurd en vervangt de geselecteerde geometrie in de demo.
- Gescheiden viewers:
  - `grb-viewer.html` met Vlaamse GRB-context (`EPSG:3812`)
  - `brk-viewer.html` met Nederlandse BRK/WFS-context (`EPSG:28992`)

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

## BRK/WFS visualisatie
- Basislagen:
  - PDOK luchtfoto RGB (standaard aan)
  - PDOK BRK percelen (standaard aan)
- Referentielaag voor alignering via WFS:
  - `https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0`
  - `typename=kadastralekaart:Perceel`
  - `id_property=identificatieLokaalID`

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

De build bevat vijf entries:
- `index.html` (overzichtspagina)
- `grb-viewer.html` (GRB host viewer)
- `brk-viewer.html` (BRK/WFS host viewer)
- `alignment-mfe.html` (GRB alignment micro-frontend)
- `alignment-mfe-wfs.html` (BRK/WFS alignment micro-frontend)

## Backend koppeling
- Viewer gebruikt `POST /aligner`.
- Standaard backend: `http://127.0.0.1:80`
- Override via `VITE_BRDR_API_BASE_URL`

Voorbeeld:
```bash
VITE_BRDR_API_BASE_URL=http://127.0.0.1:80 npm run dev
```
