# BRDR Alignment Viewer API

Deze documentatie beschrijft de herbruikbare alignment-component en de iframe micro-frontend contracten.

## 1) React component API

Publieke entrypoint:

```tsx
import {
  BrdrAlignmentViewer,
  BRDR_CRS_3812,
  type BrdrSupportedCrs,
} from "./components/alignment";

<BrdrAlignmentViewer
  crs={BRDR_CRS_3812}
  inputGeometry={selectedGeometry}
  onApplyAlignedGeometry={(aligned) => updateGeometry(aligned)}
/>;
```

Props:
- `crs` (verplicht): `EPSG:31370` of `EPSG:3812`.
- `inputGeometry` (verplicht): GeoJSON `Geometry` in hetzelfde CRS als `crs`.
- `onApplyAlignedGeometry?`: callback bij `Aanpassen`; levert gealigneerde geometrie terug.
- `onLoadingChange?`: callback met `true/false` tijdens herberekening.
- `onErrorChange?`: callback met foutboodschap of `null`.

## 2) Iframe micro-frontend contract

In de demo wordt de aligner geladen via `alignment-mfe.html` in een iframe.

### Host -> MFE

Berichttype: `BRDR_ALIGNMENT_INIT`

```ts
type InitMessage = {
  type: "BRDR_ALIGNMENT_INIT";
  payload: {
    crs: "EPSG:31370" | "EPSG:3812";
    geometry: Geometry;
  };
};
```

### MFE -> Host

Berichttype: `BRDR_ALIGNMENT_READY`
- gestuurd zodra MFE klaar is om input te ontvangen.

Berichttype: `BRDR_ALIGNMENT_APPLY`

```ts
type ApplyMessage = {
  type: "BRDR_ALIGNMENT_APPLY";
  payload: { geometry: Geometry };
};
```

Gedrag:
- Host stuurt geselecteerde geometrie + CRS via `BRDR_ALIGNMENT_INIT`.
- MFE toont aligneringsflow en berekent predictions.
- Bij `Aanpassen` stuurt MFE de gekozen gealigneerde geometrie terug via `BRDR_ALIGNMENT_APPLY`.
- Host vervangt de geselecteerde geometrie met de teruggestuurde geometrie.

## 3) Integratieverwachtingen

- Host is verantwoordelijk voor tekenen/selecteren/beheren van geometrieën.
- Alignment viewer is verantwoordelijk voor BRDR-instellingen, herberekening en keuze van prediction.
- Geometry moet geldig GeoJSON zijn (`Point`, `MultiPoint`, `LineString`, `MultiLineString`, `Polygon`, `MultiPolygon`).
- Bij CRS-mismatch moet de host eerst reprojection uitvoeren.

## 4) Lage-level bouwblokken

- `BrdrAlignmentViewer`: complete aligneringscomponent.
- `BrdrAlignPanel`: settings + resultatenworkflow.
- `MapView`: kaartcomponent voor weergave van input/resultaat/lagen.
- `useBrdrState({ crs, initialGeometry? })`: BRDR state + API calls.
