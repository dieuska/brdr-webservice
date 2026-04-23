# BRDR Viewer Component API

## Public entrypoint

Gebruik `BrdrAlignmentViewer` als herbruikbare component.

```tsx
import {
  BrdrAlignmentViewer,
  BRDR_CRS_3812,
} from "./components/alignment";

<BrdrAlignmentViewer
  crs={BRDR_CRS_3812}
  inputGeometry={selectedGeometry}
  onApplyAlignedGeometry={(aligned) => updateGeometry(aligned)}
/>;
```

## Props

- `crs` (verplicht): `EPSG:31370` of `EPSG:3812` (aanbevolen).
- `inputGeometry` (verplicht): `Geometry` die je in de aligner wil verwerken.
- `onApplyAlignedGeometry?`: callback bij klik op `Aanpassen`; levert de gealigneerde geometrie terug.
- `onLoadingChange?`: callback met `true/false` tijdens herberekening.
- `onErrorChange?`: callback met foutboodschap of `null`.

## Contract

- Viewer verwacht GeoJSON geometrie in hetzelfde CRS als `crs`.
- Deze viewer is enkel voor alignering en gebruikt een eigen kaart.
- Bij `Aanpassen` wordt de geselecteerde gealigneerde geometrie via callback teruggegeven aan de host.
- Tekenen/selecteren van geometrie gebeurt in de hostapp (bijvoorbeeld een aparte demo-kaart).

## Lage-level bouwblokken

- `MapView`: basiskaart, configureerbaar met/zonder tekeninteractie.
- `BrdrAlignPanel`: BRDR settings + resultatenworkflow.
- `useBrdrState({ crs, initialGeometry? })`: state en BRDR-oproepen.
