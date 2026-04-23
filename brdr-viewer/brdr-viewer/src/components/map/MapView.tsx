import { useEffect, useMemo, useRef } from "react";
import Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import type { Geometry as OlGeometry } from "ol/geom";
import Draw from "ol/interaction/Draw";
import Modify from "ol/interaction/Modify";
import Snap from "ol/interaction/Snap";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Circle as CircleStyle, Fill, Stroke, Style } from "ol/style";
import { useOpenLayersMap } from "../../hooks/useOpenLayersMap";
import { useBrdrLayers } from "./brdr/useBrdrLayers";
import type { BrdrStep, Geometry } from "../../types/brdr";
import "./MapView.css";

export type DrawGeometryType = "Polygon" | "LineString" | "Point";

interface Props {
  step: BrdrStep | null;
  selectedGrbType?: string;
  showDiffLayers: boolean;
  suspendBrdrLayers: boolean;
  loading: boolean;
  drawHint: string;
  inputGeometry: Geometry | null;
  onInputGeometryChange: (geometry: Geometry) => void;
  drawRequestToken: number;
  drawGeometryType: DrawGeometryType;
}

const INPUT_LAYER_KEY = "brdr-input";
const INPUT_LAYER_Z_INDEX = 1000;

export default function MapView({
  step,
  selectedGrbType,
  showDiffLayers,
  suspendBrdrLayers,
  loading,
  drawHint,
  inputGeometry,
  onInputGeometryChange,
  drawRequestToken,
  drawGeometryType,
}: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const map = useOpenLayersMap(divRef, selectedGrbType);
  const sourceRef = useRef<VectorSource | null>(null);
  const currentTokenRef = useRef(-1);
  const drawRef = useRef<Draw | null>(null);
  const hasFittedInputRef = useRef(false);
  const onInputGeometryChangeRef = useRef(onInputGeometryChange);
  const format = useMemo(() => new GeoJSON(), []);

  useBrdrLayers(map, step, showDiffLayers, suspendBrdrLayers);

  useEffect(() => {
    onInputGeometryChangeRef.current = onInputGeometryChange;
  }, [onInputGeometryChange]);

  useEffect(() => {
    if (!map || sourceRef.current) return;

    const source = new VectorSource();
    const inputLayer = new VectorLayer({
      source,
      style: new Style({
        stroke: new Stroke({ color: "#2563eb", width: 2 }),
        fill: new Fill({ color: "rgba(37,99,235,0.1)" }),
        image: new CircleStyle({
          radius: 6,
          fill: new Fill({ color: "#2563eb" }),
          stroke: new Stroke({ color: "#ffffff", width: 1.5 }),
        }),
      }),
    });
    inputLayer.setZIndex(INPUT_LAYER_Z_INDEX);
    inputLayer.set(INPUT_LAYER_KEY, true);

    map.addLayer(inputLayer);

    const modify = new Modify({ source });
    modify.on("modifyend", () => {
      const feature = source.getFeatures()[0];
      const geometry = feature?.getGeometry();
      if (!geometry) return;
      const nextGeometry = format.writeGeometryObject(geometry, {
        dataProjection: "EPSG:31370",
        featureProjection: "EPSG:31370",
      }) as Geometry;
      onInputGeometryChangeRef.current(nextGeometry);
    });

    const snap = new Snap({ source });

    map.addInteraction(modify);
    map.addInteraction(snap);
    sourceRef.current = source;

    return () => {
      if (drawRef.current) {
        map.removeInteraction(drawRef.current);
      }
      map.removeInteraction(modify);
      map.removeInteraction(snap);
      map.removeLayer(inputLayer);
      sourceRef.current = null;
    };
  }, [format, map]);

  useEffect(() => {
    if (!map || !sourceRef.current || !inputGeometry) return;
    const feature = format.readFeature(
      { type: "Feature", geometry: inputGeometry },
      {
        dataProjection: "EPSG:31370",
        featureProjection: "EPSG:31370",
      }
    ) as Feature<OlGeometry>;

    sourceRef.current.clear();
    sourceRef.current.addFeature(feature);

    const extent = sourceRef.current.getExtent();
    if (
      !hasFittedInputRef.current &&
      extent &&
      extent.every(Number.isFinite)
    ) {
      map.getView().fit(extent, {
        padding: [60, 60, 60, 60],
        maxZoom: 20,
      });
      hasFittedInputRef.current = true;
    }
  }, [format, inputGeometry, map]);

  useEffect(() => {
    if (!map || !sourceRef.current) return;
    if (drawRequestToken === currentTokenRef.current) return;

    currentTokenRef.current = drawRequestToken;
    if (drawRef.current) {
      map.removeInteraction(drawRef.current);
      drawRef.current = null;
    }

    const draw = new Draw({
      source: sourceRef.current,
      type: drawGeometryType,
    });

    draw.on("drawstart", () => {
      sourceRef.current?.clear();
    });

    draw.on("drawend", (event) => {
      const geometry = event.feature.getGeometry();
      if (geometry) {
        const nextGeometry = format.writeGeometryObject(geometry, {
          dataProjection: "EPSG:31370",
          featureProjection: "EPSG:31370",
        }) as Geometry;
        onInputGeometryChangeRef.current(nextGeometry);
      }
    });

    drawRef.current = draw;
    map.addInteraction(draw);
  }, [drawGeometryType, drawRequestToken, format, map]);

  return (
    <div className="map-container-wrapper">
      <div ref={divRef} className="map-container" />
      {loading && (
        <div className="map-loading-overlay" role="status" aria-live="polite">
          Bezig met herberekenen...
        </div>
      )}
      <div className="map-draw-hint">{drawHint}</div>
    </div>
  );
}
