import { useState } from "react";
import MapView, { type DrawGeometryType } from "../map/MapView";
import type { Geometry } from "../../types/brdr";
import type { BrdrSupportedCrs } from "../alignment/contracts";
import { GRB_REFERENCE_LAYER_OPTIONS } from "../../data/grbReferenceLayerOptions";
import {
  BASE_LAYER_GRB_COLOR,
  BASE_LAYER_GRB_GRAY,
  BASE_LAYER_OSM,
  DEFAULT_BASE_LAYER_VISIBILITY,
  type BaseLayerVisibility,
} from "../map/layers/baseLayers";
import {
  parsePastedGeometries,
  type ImportSourceCrs,
} from "./geometryImport";
import type { MapGeometryItem } from "../map/MapView";

const DRAW_TYPE_OPTIONS: Array<{
  value: DrawGeometryType;
  label: string;
  icon: string;
}> = [
  { value: "Point", label: "Punt", icon: "." },
  { value: "LineString", label: "Lijn", icon: "/" },
  { value: "Polygon", label: "Polygoon", icon: "[]" },
];

export interface DemoGeometryItem {
  id: string;
  geometry: Geometry;
}

interface Props {
  crs: BrdrSupportedCrs;
  geometries: DemoGeometryItem[];
  selectedGeometryId: string | null;
  selectedGeometry: Geometry | null;
  onSelectGeometry: (id: string | null) => void;
  onGeometryDrawn: (geometry: Geometry) => void;
  onDeleteSelectedGeometry: () => void;
  onStartAlignment: () => void;
  activeReferenceLayers: string[];
  onActiveReferenceLayersChange: (layers: string[]) => void;
  onImportGeometries: (geometries: Geometry[]) => void;
}

export function DemoMapViewer({
  crs,
  geometries,
  selectedGeometryId,
  selectedGeometry,
  onSelectGeometry,
  onGeometryDrawn,
  onDeleteSelectedGeometry,
  onStartAlignment,
  activeReferenceLayers,
  onActiveReferenceLayersChange,
  onImportGeometries,
}: Props) {
  const [drawRequestToken, setDrawRequestToken] = useState(0);
  const [drawGeometryType, setDrawGeometryType] =
    useState<DrawGeometryType>("Polygon");
  const [baseLayerVisibility, setBaseLayerVisibility] =
    useState<BaseLayerVisibility>(DEFAULT_BASE_LAYER_VISIBILITY);
  const [importText, setImportText] = useState("");
  const [importSourceCrs, setImportSourceCrs] =
    useState<ImportSourceCrs>("EPSG:3812");
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const [selectionModeEnabled, setSelectionModeEnabled] = useState(false);

  const drawHint =
    drawGeometryType === "Point"
      ? "Punt: klik 1x op de kaart."
      : drawGeometryType === "LineString"
        ? "Lijn: klik meerdere punten, dubbelklik om te stoppen."
        : "Polygoon: klik punten, dubbelklik om te sluiten.";

  const selectedIndex = selectedGeometryId
    ? geometries.findIndex((item) => item.id === selectedGeometryId)
    : -1;

  function toggleReferenceLayer(layerName: string) {
    const next = activeReferenceLayers.includes(layerName)
      ? activeReferenceLayers.filter((item) => item !== layerName)
      : [...activeReferenceLayers, layerName];
    onActiveReferenceLayersChange(next);
  }

  function toggleBaseLayer(layerId: keyof BaseLayerVisibility) {
    setBaseLayerVisibility((prev) => ({
      ...prev,
      [layerId]: !prev[layerId],
    }));
  }

  function handleImport() {
    try {
      const geometriesToAdd = parsePastedGeometries(
        importText,
        importSourceCrs,
        crs
      );
      onImportGeometries(geometriesToAdd);
      setImportFeedback(`${geometriesToAdd.length} geometrie(en) toegevoegd.`);
      setImportText("");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Kon de input niet parsen als WKT of GeoJSON.";
      setImportFeedback(message);
    }
  }

  return (
    <div className="demo-map-viewer">
      <div className="demo-map-toolbar">
        <div className="draw-type-picker" aria-label="Tekentype">
          {DRAW_TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="draw-type-button"
              aria-pressed={drawGeometryType === option.value}
              onClick={() => {
                setDrawGeometryType(option.value);
                setDrawRequestToken((v) => v + 1);
                setSelectionModeEnabled(false);
              }}
              title={option.label}
            >
              <span className="draw-type-icon" aria-hidden="true">
                {option.icon}
              </span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>

        <label className="demo-geometry-select">
          Geometrie
          <select
            value={selectedGeometryId ?? ""}
            onChange={(event) =>
              onSelectGeometry(event.target.value || null)
            }
          >
            <option value="">Geen selectie</option>
            {geometries.map((item, index) => (
              <option key={item.id} value={item.id}>
                Geometrie {index + 1}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="demo-secondary-button"
          aria-pressed={selectionModeEnabled}
          onClick={() => setSelectionModeEnabled((prev) => !prev)}
        >
          {selectionModeEnabled ? "Selectie actief" : "Selecteer op kaart"}
        </button>

        <button
          type="button"
          className="demo-secondary-button"
          onClick={onDeleteSelectedGeometry}
          disabled={selectedIndex < 0}
        >
          Verwijder geselecteerde
        </button>

        <button
          type="button"
          className="demo-align-button"
          onClick={onStartAlignment}
          disabled={!selectedGeometry}
        >
          Start BRDR alignering
        </button>

        <details className="demo-layer-picker">
          <summary>Achtergrondlagen</summary>
          <div className="demo-layer-picker-list">
            <label className="demo-layer-checkbox">
              <input
                type="checkbox"
                checked={baseLayerVisibility[BASE_LAYER_GRB_COLOR]}
                onChange={() => toggleBaseLayer(BASE_LAYER_GRB_COLOR)}
              />
              <span>GRB basiskaart kleur</span>
            </label>
            <label className="demo-layer-checkbox">
              <input
                type="checkbox"
                checked={baseLayerVisibility[BASE_LAYER_GRB_GRAY]}
                onChange={() => toggleBaseLayer(BASE_LAYER_GRB_GRAY)}
              />
              <span>GRB basiskaart grijs</span>
            </label>
            <label className="demo-layer-checkbox">
              <input
                type="checkbox"
                checked={baseLayerVisibility[BASE_LAYER_OSM]}
                onChange={() => toggleBaseLayer(BASE_LAYER_OSM)}
              />
              <span>OSM</span>
            </label>
          </div>
        </details>

        <details className="demo-layer-picker">
          <summary>GRB OGC lagen</summary>
          <div className="demo-layer-picker-list">
            {GRB_REFERENCE_LAYER_OPTIONS.map((layerName) => (
              <label key={layerName} className="demo-layer-checkbox">
                <input
                  type="checkbox"
                  checked={activeReferenceLayers.includes(layerName)}
                  onChange={() => toggleReferenceLayer(layerName)}
                />
                <span>{layerName}</span>
              </label>
            ))}
          </div>
        </details>

        <details className="demo-layer-picker demo-import-panel">
          <summary>Plak WKT / GeoJSON</summary>
          <div className="demo-layer-picker-list">
            <label className="demo-geometry-select">
              Bron-CRS
              <select
                value={importSourceCrs}
                onChange={(event) =>
                  setImportSourceCrs(event.target.value as ImportSourceCrs)
                }
              >
                <option value="EPSG:3812">EPSG:3812</option>
                <option value="EPSG:31370">EPSG:31370</option>
                <option value="EPSG:4326">WGS84 (EPSG:4326)</option>
              </select>
            </label>
            <textarea
              className="demo-import-textarea"
              placeholder="Plak hier WKT of GeoJSON..."
              value={importText}
              onChange={(event) => {
                setImportText(event.target.value);
                setImportFeedback(null);
              }}
            />
            <button
              type="button"
              className="demo-align-button"
              onClick={handleImport}
              disabled={!importText.trim()}
            >
              Voeg geometrie toe
            </button>
            {importFeedback && (
              <p className="demo-import-feedback">{importFeedback}</p>
            )}
          </div>
        </details>
      </div>

      <MapView
        crs={crs}
        step={null}
        contextGeometries={geometries.map((item, index) => ({
          ...(item as MapGeometryItem),
          label: String(index + 1),
        }))}
        selectedGeometryId={selectedGeometryId}
        selectionEnabled={selectionModeEnabled}
        onSelectGeometryById={onSelectGeometry}
        baseLayerVisibility={baseLayerVisibility}
        showReferenceLayer
        selectedGrbTypes={activeReferenceLayers}
        showDiffLayers={false}
        suspendBrdrLayers={false}
        loading={false}
        inputGeometry={selectedGeometry}
        onInputGeometryChange={onGeometryDrawn}
        drawRequestToken={drawRequestToken}
        drawGeometryType={drawGeometryType}
        drawHint={drawHint}
        drawEnabled={!selectionModeEnabled}
        allowGeometryEditing={false}
      />
    </div>
  );
}
