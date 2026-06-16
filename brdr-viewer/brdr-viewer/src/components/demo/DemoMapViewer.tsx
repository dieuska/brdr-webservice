import { useEffect, useMemo, useState } from "react";
import MapView, { type DrawGeometryType } from "../map/MapView";
import type { Geometry } from "../../types/brdr";
import type { BrdrSupportedCrs } from "../alignment/contracts";
import { GRB_REFERENCE_LAYER_OPTIONS } from "../../data/grbReferenceLayerOptions";
import {
  BASE_LAYER_BRK_LUCHTFOTO,
  BASE_LAYER_BRK_PDOK,
  BASE_LAYER_GRB_COLOR,
  BASE_LAYER_GRB_GRAY,
  BASE_LAYER_OSM,
  DEFAULT_BASE_LAYER_VISIBILITY,
  type BaseLayerVisibility,
} from "../map/layers/baseLayers";
import {
  parsePastedGeometries,
  serializeGeometry,
  type ExportTargetCrs,
  type GeometryExportFormat,
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

export interface DemoAlignmentMode {
  path: string;
  label: string;
  title: string;
}

interface Props {
  crs: BrdrSupportedCrs;
  geometries: DemoGeometryItem[];
  selectedGeometryId: string | null;
  selectedGeometry: Geometry | null;
  onSelectGeometry: (id: string | null) => void;
  onGeometryDrawn: (geometry: Geometry) => void;
  onDeleteSelectedGeometry: () => void;
  alignmentModes: DemoAlignmentMode[];
  onStartAlignment: (mode: DemoAlignmentMode) => void;
  activeReferenceLayers: string[];
  onActiveReferenceLayersChange: (layers: string[]) => void;
  onImportGeometries: (geometries: Geometry[]) => void;
  showGrbReferenceControls?: boolean;
}

export function DemoMapViewer({
  crs,
  geometries,
  selectedGeometryId,
  selectedGeometry,
  onSelectGeometry,
  onGeometryDrawn,
  onDeleteSelectedGeometry,
  alignmentModes,
  onStartAlignment,
  activeReferenceLayers,
  onActiveReferenceLayersChange,
  onImportGeometries,
  showGrbReferenceControls = true,
}: Props) {
  const [drawRequestToken, setDrawRequestToken] = useState(0);
  const [drawGeometryType, setDrawGeometryType] =
    useState<DrawGeometryType>("Polygon");
  const [baseLayerVisibility, setBaseLayerVisibility] =
    useState<BaseLayerVisibility>(
      showGrbReferenceControls
        ? DEFAULT_BASE_LAYER_VISIBILITY
        : {
            [BASE_LAYER_OSM]: false,
            [BASE_LAYER_GRB_COLOR]: false,
            [BASE_LAYER_GRB_GRAY]: false,
            [BASE_LAYER_BRK_PDOK]: true,
            [BASE_LAYER_BRK_LUCHTFOTO]: true,
          }
    );
  const [importText, setImportText] = useState("");
  const [importSourceCrs, setImportSourceCrs] =
    useState<ImportSourceCrs>(crs);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const [exportTargetCrs, setExportTargetCrs] =
    useState<ExportTargetCrs>(crs);
  const [exportFormat, setExportFormat] =
    useState<GeometryExportFormat>("wkt");
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const [selectionModeEnabled, setSelectionModeEnabled] = useState(false);
  const [fitRequestToken, setFitRequestToken] = useState(0);

  const drawHint =
    drawGeometryType === "Point"
      ? "Punt: klik 1x op de kaart."
      : drawGeometryType === "LineString"
        ? "Lijn: klik meerdere punten, dubbelklik om te stoppen."
        : "Polygoon: klik punten, dubbelklik om te sluiten.";

  const selectedIndex = selectedGeometryId
    ? geometries.findIndex((item) => item.id === selectedGeometryId)
    : -1;
  const hasSelection = selectedIndex >= 0 && Boolean(selectedGeometry);
  const selectedLabel =
    selectedIndex >= 0 ? `Geometrie ${selectedIndex + 1}` : "Geen selectie";
  const workflowHint = hasSelection
    ? "Kies hieronder een aligneringsmodus of pas de gekozen geometrie verder aan."
    : selectionModeEnabled
      ? "Klik op een bestaande geometrie in de kaart om die te selecteren."
      : "Kies een tekentype en klik in de kaart, of importeer een geometrie.";
  const selectionSummary = hasSelection
    ? `${selectedLabel} is klaar om te aligneren.`
    : "Selecteer of teken eerst een geometrie.";

  useEffect(() => {
    if (!selectedGeometryId || !selectedGeometry) return;
    setFitRequestToken((token) => token + 1);
  }, [selectedGeometry, selectedGeometryId]);

  useEffect(() => {
    setImportSourceCrs(crs);
    setExportTargetCrs(crs);
  }, [crs]);

  const exportText = useMemo(() => {
    if (!selectedGeometry) {
      return "";
    }

    return serializeGeometry(
      selectedGeometry,
      crs,
      exportTargetCrs,
      exportFormat
    );
  }, [crs, exportFormat, exportTargetCrs, selectedGeometry]);

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

  async function handleCopyExport() {
    if (!exportText) {
      setExportFeedback("Selecteer eerst een geometrie.");
      return;
    }

    try {
      await navigator.clipboard.writeText(exportText);
      setExportFeedback("Geometrie gekopieerd.");
    } catch {
      setExportFeedback("Kopieren via klembord is niet gelukt.");
    }
  }

  return (
    <div className="demo-map-viewer">
      <div className="demo-map-intro">
        <div className="demo-map-intro-copy">
          <p className="demo-map-eyebrow">Demo-kaart</p>
          <h2>Snel starten met een geometrie op de kaart</h2>
          <p>{workflowHint}</p>
        </div>
        <div className="demo-map-status" aria-label="Status van de demo-kaart">
          <span className="demo-status-chip">
            {geometries.length} geometrie{geometries.length === 1 ? "" : "en"}
          </span>
          <span className={`demo-status-chip${hasSelection ? " is-active" : ""}`}>
            {selectedLabel}
          </span>
        </div>
      </div>

      <div className="demo-map-toolbar">
        <div className="demo-toolbar-section demo-toolbar-section-primary">
          <div className="demo-toolbar-heading">
            <strong>1. Kies of teken een geometrie</strong>
            <span>{selectionSummary}</span>
          </div>

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
        </div>

        <div className="demo-toolbar-section">
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
            onClick={() => setFitRequestToken((token) => token + 1)}
            disabled={!hasSelection}
          >
            Zoom naar selectie
          </button>

          <button
            type="button"
            className="demo-secondary-button"
            onClick={onDeleteSelectedGeometry}
            disabled={!hasSelection}
          >
            Verwijder geselecteerde
          </button>
        </div>

        <div className="demo-toolbar-section demo-toolbar-section-accent">
          <div className="demo-toolbar-heading">
            <strong>2. Start een alignering</strong>
            <span>Kies de gewenste flow voor de geselecteerde geometrie.</span>
          </div>

          <div className="demo-align-actions">
            {alignmentModes.map((mode) => (
              <button
                key={mode.path}
                type="button"
                className="demo-align-button"
                onClick={() => onStartAlignment(mode)}
                disabled={!selectedGeometry}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        <details className="demo-layer-picker">
          <summary>Achtergrondlagen</summary>
          <div className="demo-layer-picker-list">
            {!showGrbReferenceControls && (
              <label className="demo-layer-checkbox">
                <input
                  type="checkbox"
                  checked={baseLayerVisibility[BASE_LAYER_BRK_PDOK]}
                  onChange={() => toggleBaseLayer(BASE_LAYER_BRK_PDOK)}
                />
                <span>PDOK BRK percelen</span>
              </label>
            )}
            {!showGrbReferenceControls && (
              <label className="demo-layer-checkbox">
                <input
                  type="checkbox"
                  checked={baseLayerVisibility[BASE_LAYER_BRK_LUCHTFOTO]}
                  onChange={() => toggleBaseLayer(BASE_LAYER_BRK_LUCHTFOTO)}
                />
                <span>PDOK luchtfoto RGB</span>
              </label>
            )}
            {showGrbReferenceControls && (
              <label className="demo-layer-checkbox">
                <input
                  type="checkbox"
                  checked={baseLayerVisibility[BASE_LAYER_GRB_COLOR]}
                  onChange={() => toggleBaseLayer(BASE_LAYER_GRB_COLOR)}
                />
                <span>GRB basiskaart kleur</span>
              </label>
            )}
            {showGrbReferenceControls && (
              <label className="demo-layer-checkbox">
                <input
                  type="checkbox"
                  checked={baseLayerVisibility[BASE_LAYER_GRB_GRAY]}
                  onChange={() => toggleBaseLayer(BASE_LAYER_GRB_GRAY)}
                />
                <span>GRB basiskaart grijs</span>
              </label>
            )}
            {showGrbReferenceControls && (
              <label className="demo-layer-checkbox">
                <input
                  type="checkbox"
                  checked={baseLayerVisibility[BASE_LAYER_OSM]}
                  onChange={() => toggleBaseLayer(BASE_LAYER_OSM)}
                />
                <span>OSM</span>
              </label>
            )}
          </div>
        </details>

        {showGrbReferenceControls && (
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
        )}

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
                <option value="EPSG:28992">EPSG:28992</option>
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

        <details className="demo-layer-picker demo-import-panel">
          <summary>Haal WKT / GeoJSON op</summary>
          <div className="demo-layer-picker-list">
            <label className="demo-geometry-select">
              Formaat
              <select
                value={exportFormat}
                onChange={(event) => {
                  setExportFormat(event.target.value as GeometryExportFormat);
                  setExportFeedback(null);
                }}
              >
                <option value="wkt">WKT</option>
                <option value="geojson">GeoJSON</option>
              </select>
            </label>
            <label className="demo-geometry-select">
              Doel-CRS
              <select
                value={exportTargetCrs}
                onChange={(event) => {
                  setExportTargetCrs(event.target.value as ExportTargetCrs);
                  setExportFeedback(null);
                }}
              >
                <option value="EPSG:3812">EPSG:3812</option>
                <option value="EPSG:31370">EPSG:31370</option>
                <option value="EPSG:28992">EPSG:28992</option>
                <option value="EPSG:4326">WGS84 (EPSG:4326)</option>
              </select>
            </label>
            <textarea
              className="demo-import-textarea demo-export-textarea"
              placeholder="Selecteer een geometrie om WKT of GeoJSON op te halen..."
              value={exportText}
              readOnly
            />
            <button
              type="button"
              className="demo-align-button"
              onClick={() => void handleCopyExport()}
              disabled={!selectedGeometry}
            >
              Kopieer geometrie
            </button>
            {exportFeedback && (
              <p className="demo-import-feedback">{exportFeedback}</p>
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
        fitRequestToken={fitRequestToken}
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
        inputGeometryStyle="yellow"
      />
    </div>
  );
}
