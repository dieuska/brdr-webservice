import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GeoJSON from "ol/format/GeoJSON";
import WKT from "ol/format/WKT";
import type { Geometry as OlGeometry } from "ol/geom";
import Map from "ol/Map";
import { transform } from "ol/proj";
import { unByKey } from "ol/Observable";
import type { EventsKey } from "ol/events";
import MapView, { type DrawGeometryType, type MapLayerVisibility } from "../map/MapView";
import { useBrdrState } from "../../state/useBrdrState";
import type { Geometry } from "../../types/brdr";
import { BRDR_CRS_31370 } from "../alignment/contracts";
import {
  isAlignmentApplyMessage,
  isAlignmentReadyMessage,
} from "../alignment/messageSecurity";
import {
  BASE_LAYER_GRB_COLOR,
  BASE_LAYER_GRB_GRAY,
  BASE_LAYER_OSM,
  DEFAULT_BASE_LAYER_VISIBILITY,
  type BaseLayerVisibility,
} from "../map/layers/baseLayers";

const GRB_ADP_REFERENCE_LAYER = "GRB - ADP - administratief perceel";

// Gealigneerde brongeometrie in EPSG:31370 (Lambert 72).
const INITIAL_GEOMETRY: Geometry = {
  type: "Polygon",
  coordinates: [[
    [174117.48808407906, 179158.054926374],
    [174111.6830116799, 179153.79482142627],
    [174110.1237813422, 179153.99846482463],
    [174069.13814894308, 179159.35178971943],
    [174069.15837224852, 179159.4705032697],
    [174072.0591689511, 179176.47963143047],
    [174074.13729168347, 179188.66770655755],
    [174121.469167022, 179180.50787992403],
    [174119.27110119144, 179168.10886237584],
    [174117.5118922592, 179158.18913362268],
    [174117.48808407906, 179158.054926374],
  ]],
};

function transformGeometry(
  geometry: Geometry,
  sourceCrs: string,
  targetCrs: string
): Geometry {
  const format = new GeoJSON();
  const olGeometry = format.readGeometry(geometry, {
    dataProjection: sourceCrs,
    featureProjection: sourceCrs,
  }) as OlGeometry;
  olGeometry.transform(sourceCrs, targetCrs);
  return format.writeGeometryObject(olGeometry, {
    dataProjection: targetCrs,
    featureProjection: targetCrs,
  }) as Geometry;
}

const DRAW_TYPES: Array<{ value: DrawGeometryType; label: string }> = [
  { value: "Polygon", label: "Polygoon" },
  { value: "LineString", label: "Lijn" },
  { value: "Point", label: "Punt" },
];

export function CrsComparisonViewer() {
  const [drawType, setDrawType] = useState<DrawGeometryType>("Polygon");
  const [drawRequestToken, setDrawRequestToken] = useState(0);
  const [fitRequestToken, setFitRequestToken] = useState(0);
  const [alignmentOpen, setAlignmentOpen] = useState(false);
  const [baseLayerVisibility, setBaseLayerVisibility] =
    useState<BaseLayerVisibility>({
      ...DEFAULT_BASE_LAYER_VISIBILITY,
      [BASE_LAYER_OSM]: true,
    });
  const [maps, setMaps] = useState<Array<{ map: Map; crs: "EPSG:31370" | "EPSG:3812" }>>([]);
  const syncingRef = useRef(false);
  const alignmentFrameRef = useRef<HTMLIFrameElement | null>(null);
  const alignmentReadyRef = useRef(false);
  const alignmentMfeUrl = useMemo(() => {
    const url = new URL(
      `${import.meta.env.BASE_URL}alignment-mfe-simple.html`,
      window.location.href
    );
    url.searchParams.set("hostOrigin", window.location.origin);
    return url.toString();
  }, []);
  const alignmentMfeOrigin = new URL(alignmentMfeUrl).origin;

  const registerMap = useCallback((map: Map, crs: "EPSG:31370" | "EPSG:3812") => {
    setMaps((current) => {
      if (current.some((entry) => entry.map === map)) return current;
      return [...current, { map, crs }];
    });
  }, []);

  useEffect(() => {
    if (maps.length < 3) return;
    const listeners: EventsKey[] = [];

    const syncFrom = (source: { map: Map; crs: "EPSG:31370" | "EPSG:3812" }) => {
      if (syncingRef.current) return;
      const center = source.map.getView().getCenter();
      if (!center) return;
      syncingRef.current = true;
      maps.forEach((target) => {
        if (target.map === source.map) return;
        target.map.getView().setCenter(transform(center, source.crs, target.crs));
        const zoom = source.map.getView().getZoom();
        if (zoom !== undefined) target.map.getView().setZoom(zoom);
        target.map.getView().setRotation(source.map.getView().getRotation());
      });
      syncingRef.current = false;
    };

    maps.forEach((source) => {
      const listener = () => syncFrom(source);
      listeners.push(source.map.getView().on("change:center", listener));
      listeners.push(source.map.getView().on("change:resolution", listener));
      listeners.push(source.map.getView().on("change:rotation", listener));
    });

    syncFrom(maps[0]);
    return () => unByKey(listeners);
  }, [maps, syncingRef]);

  const [inputGeometry, setInputGeometry] = useState<Geometry>(INITIAL_GEOMETRY);
  const transformedInitial3812 = transformGeometry(INITIAL_GEOMETRY, BRDR_CRS_31370, "EPSG:3812");
  const {
    updateInputGeometry,
    calculateForInputGeometry,
    currentStep,
    currentStepIsPrediction,
    currentStepPredictionScore,
    values,
    diffMetric,
    stepIndex,
    loading,
    error,
  } = useBrdrState({
    crs: "EPSG:3812",
    initialGeometry: transformedInitial3812,
  });

  const transformedInput3812 = transformGeometry(inputGeometry, BRDR_CRS_31370, "EPSG:3812");
  const aligned3812 = currentStep?.result ?? null;
  const currentDiffValue = values[stepIndex] ?? null;
  const metricLabel = diffMetric === "area"
    ? "Oppervlakteverschil"
    : diffMetric === "length"
      ? "Lengteverschil"
      : "Verschil tot de referentie";
  const metricUnit = diffMetric === "area" ? "m²" : diffMetric === "length" ? "m" : "punten";

  function handleGeometryChange(geometry: Geometry) {
    setInputGeometry(geometry);
    const geometry3812 = transformGeometry(geometry, BRDR_CRS_31370, "EPSG:3812");
    updateInputGeometry(geometry3812);
    void calculateForInputGeometry(geometry3812);
  }

  function openAlignmentMfe() {
    alignmentReadyRef.current = false;
    setAlignmentOpen(true);
  }

  useEffect(() => {
    if (!alignmentOpen || !alignmentReadyRef.current) return;
    const frameWindow = alignmentFrameRef.current?.contentWindow;
    frameWindow?.postMessage(
      {
        type: "BRDR_ALIGNMENT_INIT",
        payload: { crs: BRDR_CRS_31370, geometry: inputGeometry },
      },
      alignmentMfeOrigin
    );
  }, [alignmentMfeOrigin, alignmentOpen, inputGeometry]);

  useEffect(() => {
    function onMessage(event: MessageEvent<unknown>) {
      if (!alignmentOpen) return;
      if (event.origin !== alignmentMfeOrigin) return;
      if (event.source !== alignmentFrameRef.current?.contentWindow) return;

      if (isAlignmentReadyMessage(event.data)) {
        alignmentReadyRef.current = true;
        alignmentFrameRef.current?.contentWindow?.postMessage(
          {
            type: "BRDR_ALIGNMENT_INIT",
            payload: { crs: BRDR_CRS_31370, geometry: inputGeometry },
          },
          alignmentMfeOrigin
        );
        return;
      }

      if (isAlignmentApplyMessage(event.data)) {
        handleGeometryChange(event.data.payload.geometry);
        alignmentReadyRef.current = false;
        setAlignmentOpen(false);
      }
    }

    window.addEventListener("message", onMessage as EventListener);
    return () => window.removeEventListener("message", onMessage as EventListener);
  }, [alignmentMfeOrigin, alignmentOpen, inputGeometry]);

  function toggleBaseLayer(layerId: keyof BaseLayerVisibility) {
    setBaseLayerVisibility((current) => ({
      ...current,
      [layerId]: !current[layerId],
    }));
  }

  const drawHint =
    drawType === "Point"
      ? "Klik op de kaart om een punt te plaatsen."
      : drawType === "LineString"
        ? "Klik punten en dubbelklik om de lijn te beëindigen."
        : "Klik punten en dubbelklik om de polygoon te sluiten.";

  return (
    <>
      <main className="crs-viewer">
      <header className="crs-viewer-header">
        <div>
          <a className="viewer-home-link" href={import.meta.env.BASE_URL}>← Demo-overzicht</a>
          <p className="crs-viewer-kicker">BRDR alignment viewer</p>
          <h1>Van Lambert 72 naar Lambert 2008 met BRDR</h1>
          <p className="crs-viewer-lede">
            De geometrie ligt al correct op GRB in Lambert 72. Na conversie naar Lambert 2008 kunnen afrondingsverschillen op millimeterniveau ontstaan. BRDR stelt die laatste afwijking opnieuw af op de 3812-referentie.
          </p>
        </div>
        <div className="crs-viewer-status" aria-live="polite">
          <span className={loading ? "status-dot is-loading" : "status-dot"} />
          {loading ? "BRDR rekent" : error ? "Controleer de aanvraag" : "Resultaat beschikbaar"}
        </div>
      </header>

      <section className="crs-input-section">
        <div className="crs-section-heading">
          <div>
            <span className="crs-step-number">01</span>
            <div>
              <h2>Brongeometrie op GRB</h2>
              <p>De brongeometrie is al correct uitgelijnd op de GRB-referentie in EPSG:31370.</p>
            </div>
          </div>
          <div className="crs-toolbar">
            <span className="crs-badge">EPSG:31370</span>
            {DRAW_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                className="crs-tool-button"
                aria-pressed={drawType === type.value}
                onClick={() => {
                  setDrawType(type.value);
                  setDrawRequestToken((token) => token + 1);
                }}
              >
                {type.label}
              </button>
            ))}
            <button
              type="button"
              className="crs-tool-button"
              onClick={() => setFitRequestToken((token) => token + 1)}
              disabled={!inputGeometry}
            >
              Zoom naar geometrie
            </button>
            <button
              type="button"
              className="crs-tool-button crs-tool-button-primary"
              onClick={openAlignmentMfe}
              disabled={!inputGeometry}
            >
              BRDR aligneren in 31370
            </button>
          </div>
        </div>
        <div className="crs-input-map">
          <MapView
            crs={BRDR_CRS_31370}
            step={null}
            showReferenceLayer
            selectedGrbTypes={[GRB_ADP_REFERENCE_LAYER]}
            baseLayerVisibility={baseLayerVisibility}
            showDiffLayers={false}
            suspendBrdrLayers
            loading={false}
            inputGeometry={inputGeometry}
            onInputGeometryChange={handleGeometryChange}
            drawRequestToken={drawRequestToken}
            drawGeometryType={drawType}
            drawHint={drawHint}
            drawEnabled
            allowGeometryEditing
            inputGeometryStyle="yellow"
            fitRequestToken={fitRequestToken}
            initialCenterLonLat={[4.7, 50.88]}
            onMapReady={(map) => registerMap(map, "EPSG:31370")}
          />
          <div className="map-corner-label">GRB / brongeometrie</div>
        </div>
        <details className="crs-layer-picker">
          <summary>Kaartlagen</summary>
          <label><input type="checkbox" checked={baseLayerVisibility[BASE_LAYER_GRB_GRAY]} onChange={() => toggleBaseLayer(BASE_LAYER_GRB_GRAY)} /> GRB grijs</label>
          <label><input type="checkbox" checked={baseLayerVisibility[BASE_LAYER_GRB_COLOR]} onChange={() => toggleBaseLayer(BASE_LAYER_GRB_COLOR)} /> GRB kleur</label>
          <label><input type="checkbox" checked={baseLayerVisibility[BASE_LAYER_OSM]} onChange={() => toggleBaseLayer(BASE_LAYER_OSM)} /> OSM</label>
        </details>
      </section>

      <section className="crs-results-section">
        <div className="crs-section-heading results-heading">
          <div>
            <span className="crs-step-number">02</span>
            <div>
              <h2>Conversie naar Lambert 2008</h2>
          <p>Beide resultaten staan in EPSG:3812. Zoom in op de rand om het millimeterverschil zichtbaar te maken.</p>
            </div>
          </div>
          {currentStep && (
            <div className="crs-result-meta">
              {currentStepIsPrediction ? "Beste voorspelling" : "BRDR-stap"} · score {currentStepPredictionScore.toFixed(3)}
            </div>
          )}
        </div>
        {error && <p className="crs-error">{error}</p>}
        <div className="crs-conversion-summary">
          <span><strong>Bron</strong> EPSG:31370</span>
          <span className="crs-summary-arrow">→</span>
          <span><strong>Doel</strong> EPSG:3812</span>
          {currentDiffValue !== null && <span><strong>{metricLabel}</strong> {currentDiffValue.toFixed(diffMetric === "count" ? 0 : 2)} {metricUnit}</span>}
        </div>
        <div className="crs-result-grid">
          <ResultMap title="Gewone transformatie" subtitle="Zonder BRDR-correctie" crs="EPSG:3812" geometry={transformedInput3812} loading={false} inputGeometryStyle="yellow" onMapReady={registerMap} />
          <ResultMap title="BRDR-gecorrigeerd" subtitle="Terug afgestemd op GRB" crs="EPSG:3812" geometry={aligned3812} loading={loading} inputGeometryStyle="blue" onMapReady={registerMap} />
        </div>
        <DifferenceMap ordinaryGeometry={transformedInput3812} brdrGeometry={aligned3812} step={currentStep} loading={loading} onMapReady={registerMap} />
        <div className="crs-legend" aria-label="Legenda">
          <span><i className="crs-legend-swatch is-yellow" /> Gewone transformatie</span>
          <span><i className="crs-legend-swatch is-blue" /> BRDR-resultaat</span>
          <span><i className="crs-legend-swatch is-reference" /> GRB-referentie</span>
          <span><i className="crs-legend-swatch is-red" /> BRDR-diff min</span>
          <span><i className="crs-legend-swatch is-green" /> BRDR-diff plus</span>
          <span className="crs-legend-note">De voorbeeldafwijking is bewust klein en realistisch gehouden.</span>
        </div>
      </section>
    </main>
      {alignmentOpen && (
        <div className="alignment-modal-backdrop">
          <div className="alignment-modal">
            <div className="alignment-modal-header">
              <strong>BRDR alignering in EPSG:31370 (compact)</strong>
              <button
                type="button"
                className="alignment-close-button"
                onClick={() => {
                  alignmentReadyRef.current = false;
                  setAlignmentOpen(false);
                }}
              >
                Sluiten
              </button>
            </div>
            <div className="alignment-modal-body">
              <iframe
                ref={alignmentFrameRef}
                title="BRDR alignering in EPSG:31370"
                className="alignment-mfe-frame"
                src={alignmentMfeUrl}
                sandbox="allow-scripts allow-same-origin"
                referrerPolicy="strict-origin"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DifferenceMap({ ordinaryGeometry, brdrGeometry, step, loading, onMapReady }: { ordinaryGeometry: Geometry | null; brdrGeometry: Geometry | null; step: import("../../types/brdr").BrdrStep | null; loading: boolean; onMapReady: (map: Map, crs: "EPSG:31370" | "EPSG:3812") => void }) {
  const [layerVisibility, setLayerVisibility] = useState<MapLayerVisibility>({
    input: true, context: true, reference: true,
    brdrResult: true, brdrDiffMin: true, brdrDiffPlus: true,
  });
  const [measureEnabled, setMeasureEnabled] = useState(false);

  function toggleLayer(key: keyof MapLayerVisibility) {
    setLayerVisibility((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <article className="crs-difference-panel">
      <div className="crs-difference-heading">
        <div>
          <h3>Millimeterverschil op de grens</h3>
          <p>Geel = gewone conversie · blauw = BRDR-uitkomst · rood/groen = BRDR-diff. Zoom in op de perceelsrand.</p>
        </div>
        <span className="crs-badge">OVERLAY · EPSG:3812</span>
      </div>
      <div className="crs-difference-controls">
        <span className="crs-control-label">Lagen</span>
        <label><input type="checkbox" checked={layerVisibility.input} onChange={() => toggleLayer("input")} /> gewone conversie</label>
        <label><input type="checkbox" checked={layerVisibility.context} onChange={() => toggleLayer("context")} /> BRDR-resultaat</label>
        <label><input type="checkbox" checked={layerVisibility.reference} onChange={() => toggleLayer("reference")} /> GRB-referentie</label>
        <label><input type="checkbox" checked={layerVisibility.brdrDiffMin} onChange={() => toggleLayer("brdrDiffMin")} /> diff min</label>
        <label><input type="checkbox" checked={layerVisibility.brdrDiffPlus} onChange={() => toggleLayer("brdrDiffPlus")} /> diff plus</label>
        <button type="button" className="crs-tool-button" aria-pressed={measureEnabled} onClick={() => setMeasureEnabled((enabled) => !enabled)}>
          {measureEnabled ? "Meetlat actief" : "Meetlat"}
        </button>
      </div>
      <div className="crs-difference-map">
        <MapView
          crs="EPSG:3812"
          step={step}
          showReferenceLayer
          selectedGrbTypes={[GRB_ADP_REFERENCE_LAYER]}
          showDiffLayers={Boolean(step)}
          suspendBrdrLayers={!step}
          loading={loading}
          layerVisibility={layerVisibility}
          measureEnabled={measureEnabled}
          inputGeometry={ordinaryGeometry}
          inputGeometryStyle="yellow"
          contextGeometries={brdrGeometry ? [{ id: "brdr-result", geometry: brdrGeometry }] : []}
          onInputGeometryChange={() => undefined}
          drawEnabled={false}
          allowGeometryEditing={false}
          initialCenterLonLat={[4.7, 50.88]}
          onMapReady={(map) => onMapReady(map, "EPSG:3812")}
        />
        {!ordinaryGeometry && <div className="crs-empty-map">Nog geen conversieresultaat</div>}
      </div>
    </article>
  );
}

function ResultMap({ title, subtitle, crs, geometry, loading, inputGeometryStyle, onMapReady }: { title: string; subtitle: string; crs: "EPSG:31370" | "EPSG:3812"; geometry: Geometry | null; loading: boolean; inputGeometryStyle: "blue" | "yellow"; onMapReady: (map: Map, crs: "EPSG:31370" | "EPSG:3812") => void }) {
  const wkt = useMemo(() => {
    if (!geometry) return "";

    const olGeometry = new GeoJSON().readGeometry(geometry, {
      dataProjection: crs,
      featureProjection: crs,
    });
    return new WKT().writeGeometry(olGeometry);
  }, [crs, geometry]);

  return (
    <article className="crs-result-panel">
      <div className="crs-result-title"><div><h3>{title}</h3><p>{subtitle}</p></div><span>{crs}</span></div>
      <div className="crs-result-map">
        <MapView
          crs={crs}
          step={null}
          showReferenceLayer
          selectedGrbTypes={[GRB_ADP_REFERENCE_LAYER]}
          showDiffLayers={false}
          suspendBrdrLayers
          loading={loading}
          inputGeometryStyle={inputGeometryStyle}
          inputGeometry={geometry}
          onInputGeometryChange={() => undefined}
          drawEnabled={false}
          allowGeometryEditing={false}
          initialCenterLonLat={[4.7, 50.88]}
          onMapReady={(map) => onMapReady(map, crs)}
        />
        {!geometry && <div className="crs-empty-map">Nog geen BRDR-resultaat</div>}
      </div>
      <div className="crs-wkt-panel">
        <div className="crs-wkt-heading">
          <div>
            <h3>Geometrie als WKT</h3>
            <p>De geometrie in {crs}, klaar om te kopiëren.</p>
          </div>
          <span className="crs-badge">WKT · {crs}</span>
        </div>
        <textarea
          className="crs-wkt-field"
          readOnly
          value={wkt}
          placeholder="De WKT verschijnt zodra de geometrie beschikbaar is."
          aria-label={`Resulterende WKT in ${crs}`}
        />
      </div>
    </article>
  );
}
