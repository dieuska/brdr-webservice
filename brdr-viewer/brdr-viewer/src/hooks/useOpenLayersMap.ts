import { useEffect, useRef, useState } from "react";
import Map from "ol/Map";
import TileLayer from "ol/layer/Tile";
import {
  BASE_LAYER_KEY,
  createBaseLayers,
  type BaseLayerVisibility,
} from "../components/map/layers/baseLayers";
import {
  createOverlayLayers,
  GRB_REFERENCE_LAYER_KEY,
} from "../components/map/layers/overlayLayers";
import { createDefaultView } from "../components/map/view";
import type { BrdrSupportedCrs } from "../components/alignment/contracts";

export function useOpenLayersMap(
  targetRef: React.RefObject<HTMLDivElement | null>,
  grbTypeLabels?: string[],
  crs?: BrdrSupportedCrs,
  includeReferenceLayer = true,
  baseLayerVisibility?: BaseLayerVisibility
) {
  const mapRef = useRef<Map | null>(null);
  const [map, setMap] = useState<Map | null>(null);

  useEffect(() => {
    if (!targetRef.current || mapRef.current) return;

    const olMap = new Map({
      target: targetRef.current,
      layers: [
        ...createBaseLayers(baseLayerVisibility),
        ...(includeReferenceLayer ? createOverlayLayers(grbTypeLabels, crs) : []),
      ],
      view: createDefaultView(crs),
    });

    mapRef.current = olMap;
    setMap(olMap);
  }, [baseLayerVisibility, crs, grbTypeLabels, includeReferenceLayer, targetRef]);

  useEffect(() => {
    if (!includeReferenceLayer || !mapRef.current) return;
    const map = mapRef.current;
    map
      .getLayers()
      .getArray()
      .filter((candidate) => candidate.get(GRB_REFERENCE_LAYER_KEY))
      .forEach((layer) => map.removeLayer(layer));

    createOverlayLayers(grbTypeLabels, crs).forEach((layer) => map.addLayer(layer));
  }, [crs, grbTypeLabels, includeReferenceLayer]);

  useEffect(() => {
    if (!mapRef.current || !baseLayerVisibility) return;
    const map = mapRef.current;
    const baseLayers = map
      .getLayers()
      .getArray()
      .filter((candidate) => candidate.get(BASE_LAYER_KEY)) as
      TileLayer[];
    baseLayers.forEach((layer) => {
      const id = layer.get(BASE_LAYER_KEY) as keyof BaseLayerVisibility;
      if (id in baseLayerVisibility) {
        layer.setVisible(baseLayerVisibility[id]);
      }
    });
  }, [baseLayerVisibility]);

  return map;
}
