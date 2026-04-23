import { useEffect, useMemo, useRef } from "react";
import Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import type { Geometry as OlGeometry } from "ol/geom";
import type { EventsKey } from "ol/events";
import Draw from "ol/interaction/Draw";
import Modify from "ol/interaction/Modify";
import Snap from "ol/interaction/Snap";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from "ol/style";
import { useOpenLayersMap } from "../../hooks/useOpenLayersMap";
import { useBrdrLayers } from "./brdr/useBrdrLayers";
import type { BrdrStep, Geometry } from "../../types/brdr";
import { assertSupportedCrs, type BrdrSupportedCrs } from "../alignment/contracts";
import type { BaseLayerVisibility } from "./layers/baseLayers";
import { GRB_REFERENCE_LAYER_KEY } from "./layers/overlayLayers";
import "./MapView.css";

export type DrawGeometryType = "Polygon" | "LineString" | "Point";
export interface MapGeometryItem {
  id: string;
  geometry: Geometry;
  label?: string;
}

interface Props {
  crs: BrdrSupportedCrs;
  step: BrdrStep | null;
  showReferenceLayer?: boolean;
  selectedGrbTypes?: string[];
  baseLayerVisibility?: BaseLayerVisibility;
  showDiffLayers: boolean;
  suspendBrdrLayers: boolean;
  loading: boolean;
  drawHint?: string;
  inputGeometry: Geometry | null;
  onInputGeometryChange: (geometry: Geometry) => void;
  contextGeometries?: MapGeometryItem[];
  selectedGeometryId?: string | null;
  selectionEnabled?: boolean;
  onSelectGeometryById?: (id: string) => void;
  fitRequestToken?: number;
  drawRequestToken?: number;
  drawGeometryType?: DrawGeometryType;
  allowGeometryEditing?: boolean;
  drawEnabled?: boolean;
  inputGeometryStyle?: "blue" | "yellow";
}

const INPUT_LAYER_KEY = "brdr-input";
const INPUT_LAYER_Z_INDEX = 1000;
const CONTEXT_LAYER_KEY = "brdr-context";
const CONTEXT_LAYER_Z_INDEX = 900;

export default function MapView({
  crs,
  step,
  showReferenceLayer = true,
  selectedGrbTypes,
  baseLayerVisibility,
  showDiffLayers,
  suspendBrdrLayers,
  loading,
  drawHint,
  inputGeometry,
  onInputGeometryChange,
  contextGeometries = [],
  selectedGeometryId = null,
  selectionEnabled = false,
  onSelectGeometryById,
  fitRequestToken,
  drawRequestToken = 0,
  drawGeometryType = "Polygon",
  allowGeometryEditing = true,
  drawEnabled = true,
  inputGeometryStyle = "blue",
}: Props) {
  assertSupportedCrs(crs);
  const divRef = useRef<HTMLDivElement>(null);
  const map = useOpenLayersMap(
    divRef,
    selectedGrbTypes,
    crs,
    showReferenceLayer,
    baseLayerVisibility
  );
  const sourceRef = useRef<VectorSource | null>(null);
  const currentTokenRef = useRef(-1);
  const drawRef = useRef<Draw | null>(null);
  const contextLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const selectionListenerRef = useRef<EventsKey | null>(null);
  const hasFittedInputRef = useRef(false);
  const lastFitRequestTokenRef = useRef<number | null>(null);
  const onInputGeometryChangeRef = useRef(onInputGeometryChange);
  const format = useMemo(() => new GeoJSON(), []);

  useBrdrLayers(map, step, showDiffLayers, suspendBrdrLayers, crs);

  useEffect(() => {
    onInputGeometryChangeRef.current = onInputGeometryChange;
  }, [onInputGeometryChange]);

  useEffect(() => {
    if (!map || sourceRef.current) return;

    const source = new VectorSource();
    const contextLayer = new VectorLayer({
      source: new VectorSource(),
      style: (feature) => {
        const isSelected = Boolean(feature.get("isSelected"));
        return new Style({
          stroke: new Stroke({
            color: isSelected ? "rgba(202,138,4,0.95)" : "rgba(30,64,175,0.9)",
            width: isSelected ? 3 : 2.2,
          }),
          fill: new Fill({
            color: isSelected
              ? "rgba(250,204,21,0.26)"
              : "rgba(59,130,246,0.2)",
          }),
          image: new CircleStyle({
            radius: isSelected ? 8 : 6,
            fill: new Fill({
              color: isSelected ? "rgba(250,204,21,0.95)" : "rgba(37,99,235,0.9)",
            }),
            stroke: new Stroke({ color: "#ffffff", width: 1.2 }),
          }),
          text: new Text({
            text: String(feature.get("geometryLabel") ?? ""),
            font: isSelected ? "700 13px sans-serif" : "700 12px sans-serif",
            fill: new Fill({ color: isSelected ? "#7c2d12" : "#0f172a" }),
            stroke: new Stroke({ color: "#ffffff", width: 3 }),
            overflow: true,
          }),
        });
      },
    });
    contextLayer.set(CONTEXT_LAYER_KEY, true);
    contextLayer.setZIndex(CONTEXT_LAYER_Z_INDEX);

    const inputLayer = new VectorLayer({
      source,
      style: new Style({
        stroke: new Stroke({
          color: inputGeometryStyle === "yellow" ? "#ca8a04" : "#2563eb",
          width: inputGeometryStyle === "yellow" ? 2.6 : 2,
        }),
        fill: new Fill({
          color:
            inputGeometryStyle === "yellow"
              ? "rgba(250,204,21,0.22)"
              : "rgba(37,99,235,0.12)",
        }),
        image: new CircleStyle({
          radius: inputGeometryStyle === "yellow" ? 7 : 6,
          fill: new Fill({
            color: inputGeometryStyle === "yellow" ? "#eab308" : "#2563eb",
          }),
          stroke: new Stroke({ color: "#ffffff", width: 1.5 }),
        }),
      }),
    });
    inputLayer.setZIndex(INPUT_LAYER_Z_INDEX);
    inputLayer.set(INPUT_LAYER_KEY, true);

    map.addLayer(contextLayer);
    map.addLayer(inputLayer);

    let modify: Modify | null = null;
    let snap: Snap | null = null;
    if (allowGeometryEditing) {
      modify = new Modify({ source });
      modify.on("modifyend", () => {
        const feature = source.getFeatures()[0];
        const geometry = feature?.getGeometry();
        if (!geometry) return;
        const nextGeometry = format.writeGeometryObject(geometry, {
          dataProjection: crs,
          featureProjection: crs,
        }) as Geometry;
        onInputGeometryChangeRef.current(nextGeometry);
      });

      snap = new Snap({ source });
      map.addInteraction(modify);
      map.addInteraction(snap);
    }
    sourceRef.current = source;
    contextLayerRef.current = contextLayer;

    return () => {
      if (drawRef.current) {
        map.removeInteraction(drawRef.current);
      }
      if (modify) {
        map.removeInteraction(modify);
      }
      if (snap) {
        map.removeInteraction(snap);
      }
      if (selectionListenerRef.current) {
        map.un("singleclick", selectionListenerRef.current.listener);
        selectionListenerRef.current = null;
      }
      map.removeLayer(contextLayer);
      map.removeLayer(inputLayer);
      contextLayerRef.current = null;
      sourceRef.current = null;
    };
  }, [allowGeometryEditing, crs, format, inputGeometryStyle, map]);

  useEffect(() => {
    if (!map || !sourceRef.current || !inputGeometry) return;
    const feature = format.readFeature(
      { type: "Feature", geometry: inputGeometry },
      {
        dataProjection: crs,
        featureProjection: crs,
      }
    ) as Feature<OlGeometry>;

    sourceRef.current.clear();
    sourceRef.current.addFeature(feature);

    const extent = sourceRef.current.getExtent();
    const hasExplicitFitRequest =
      typeof fitRequestToken === "number" &&
      fitRequestToken !== lastFitRequestTokenRef.current;
    if (
      (hasExplicitFitRequest || !hasFittedInputRef.current) &&
      extent &&
      extent.every(Number.isFinite)
    ) {
      map.getView().fit(extent, {
        padding: [60, 60, 60, 60],
        maxZoom: 20,
      });
      if (hasExplicitFitRequest) {
        lastFitRequestTokenRef.current = fitRequestToken;
      }
      const referenceLayers = map
        .getLayers()
        .getArray()
        .filter((candidate) => candidate.get(GRB_REFERENCE_LAYER_KEY)) as
        VectorLayer<VectorSource>[];
      referenceLayers.forEach((layer) => layer.getSource()?.refresh());
      hasFittedInputRef.current = true;
    }
  }, [crs, fitRequestToken, format, inputGeometry, map]);

  useEffect(() => {
    if (!contextLayerRef.current) return;
    const contextSource = contextLayerRef.current.getSource();
    if (!contextSource) return;

    contextSource.clear();
    contextGeometries.forEach((item) => {
      const feature = format.readFeature(
        { type: "Feature", geometry: item.geometry },
        {
          dataProjection: crs,
          featureProjection: crs,
        }
      ) as Feature<OlGeometry>;
      feature.set("geometryId", item.id);
      feature.set("geometryLabel", item.label ?? "");
      feature.set("isSelected", item.id === selectedGeometryId);
      contextSource.addFeature(feature);
    });
    contextLayerRef.current.changed();
  }, [contextGeometries, crs, format, selectedGeometryId]);

  useEffect(() => {
    if (!map) return;

    if (selectionListenerRef.current) {
      map.un("singleclick", selectionListenerRef.current.listener);
      selectionListenerRef.current = null;
    }

    if (!selectionEnabled || !onSelectGeometryById) {
      return;
    }

    const listener = map.on("singleclick", (event) => {
      const selectedId = map.forEachFeatureAtPixel(
        event.pixel,
        (feature) => {
          const id = feature.get("geometryId");
          return typeof id === "string" ? id : undefined;
        },
        {
          layerFilter: (layer) => Boolean(layer.get(CONTEXT_LAYER_KEY)),
          hitTolerance: 5,
        }
      );
      if (selectedId) {
        onSelectGeometryById(selectedId);
      }
    });
    selectionListenerRef.current = listener;

    return () => {
      if (listener) {
        map.un("singleclick", listener.listener);
      }
      if (selectionListenerRef.current === listener) {
        selectionListenerRef.current = null;
      }
    };
  }, [map, onSelectGeometryById, selectionEnabled]);

  useEffect(() => {
    if (!map || !sourceRef.current) return;
    if (!drawEnabled) {
      if (drawRef.current) {
        map.removeInteraction(drawRef.current);
        drawRef.current = null;
      }
      return;
    }
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
          dataProjection: crs,
          featureProjection: crs,
        }) as Geometry;
        onInputGeometryChangeRef.current(nextGeometry);
      }
    });

    drawRef.current = draw;
    map.addInteraction(draw);
  }, [
    allowGeometryEditing,
    crs,
    drawEnabled,
    drawGeometryType,
    drawRequestToken,
    format,
    map,
  ]);

  return (
    <div className="map-container-wrapper">
      <div ref={divRef} className="map-container" />
      {loading && (
        <div className="map-loading-overlay" role="status" aria-live="polite">
          Bezig met herberekenen...
        </div>
      )}
      {drawEnabled && drawHint && <div className="map-draw-hint">{drawHint}</div>}
    </div>
  );
}
