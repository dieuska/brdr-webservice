import { useEffect, useRef, useState } from "react";
import Map from "ol/Map";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { createBaseLayers } from "../components/map/layers/baseLayers";
import {
  createOverlayLayers,
  GRB_REFERENCE_LAYER_KEY,
  updateReferenceOverlayLayer,
} from "../components/map/layers/overlayLayers";
import { createDefaultView } from "../components/map/view";

export function useOpenLayersMap(
  targetRef: React.RefObject<HTMLDivElement | null>,
  grbTypeLabel?: string
) {
  const mapRef = useRef<Map | null>(null);
  const [map, setMap] = useState<Map | null>(null);

  useEffect(() => {
    if (!targetRef.current || mapRef.current) return;

    const olMap = new Map({
      target: targetRef.current,
      layers: [
        ...createBaseLayers(),
        ...createOverlayLayers(grbTypeLabel),
      ],
      view: createDefaultView(),
    });

    mapRef.current = olMap;
    setMap(olMap);
  }, [grbTypeLabel, targetRef]);

  useEffect(() => {
    if (!mapRef.current || !grbTypeLabel) return;
    const layer = mapRef.current
      .getLayers()
      .getArray()
      .find((candidate) => candidate.get(GRB_REFERENCE_LAYER_KEY)) as
      | VectorLayer<VectorSource>
      | undefined;
    if (!layer) return;
    updateReferenceOverlayLayer(grbTypeLabel, layer);
  }, [grbTypeLabel]);

  return map;
}
