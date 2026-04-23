import { useEffect, useRef } from "react";
import Map from "ol/Map";
import type { BrdrStep } from "../../../types/brdr";
import type { BrdrSupportedCrs } from "../../alignment/contracts";
import {
  createBrdrLayersWithOptions,
  BRDR_LAYER_KEY,
} from "../brdr/brdrLayers";

export function useBrdrLayers(
  map: Map | null,
  step: BrdrStep | null,
  showDiffLayers: boolean,
  suspendLayers: boolean,
  crs: BrdrSupportedCrs
) {
  const hasZoomedRef = useRef(false);

  useEffect(() => {
    if (!map) return;
    map
      .getLayers()
      .getArray()
      .filter((l) => l.get(BRDR_LAYER_KEY))
      .forEach((l) => map.removeLayer(l));

    if (!step || suspendLayers) {
      return;
    }

    const layers = createBrdrLayersWithOptions(step, { showDiffLayers }, crs);

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
  }, [crs, map, step, showDiffLayers, suspendLayers]);
}
