import { useEffect, useRef } from "react";
import Map from "ol/Map";
import type { BrdrStep } from "../../../types/brdr";
import {
  createBrdrLayers,
  BRDR_LAYER_KEY,
} from "../brdr/brdrLayers";

export function useBrdrLayers(
  map: Map | null,
  step: BrdrStep | null
) {
  const hasZoomedRef = useRef(false);

  useEffect(() => {
    if (!map || !step) return;

    const layers = createBrdrLayers(step);

    map
      .getLayers()
      .getArray()
      .filter((l) => l.get(BRDR_LAYER_KEY))
      .forEach((l) => map.removeLayer(l));

    layers.forEach((layer) => {
      layer.set(BRDR_LAYER_KEY, true);
      map.addLayer(layer);
    });

    const extent = layers[0]?.getSource()?.getExtent();

    if (
      extent &&
      extent.every(Number.isFinite) &&
      !hasZoomedRef.current
    ) {
      map.getView().fit(extent, {
        padding: [60, 60, 60, 60],
        maxZoom: 20,
      });
      hasZoomedRef.current = true;
    }
  }, [map, step]);
}
