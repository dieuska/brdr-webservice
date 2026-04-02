import { useEffect, useRef, useState } from "react";
import Map from "ol/Map";
import { createBaseLayers } from "../components/map/layers/baseLayers";
import { createOverlayLayers } from "../components/map/layers/overlayLayers";
import { createDefaultView } from "../components/map/view";

export function useOpenLayersMap(
  targetRef: React.RefObject<HTMLDivElement | null>
) {
  const mapRef = useRef<Map | null>(null);
  const [map, setMap] = useState<Map | null>(null);

  useEffect(() => {
    if (!targetRef.current || mapRef.current) return;

    const olMap = new Map({
      target: targetRef.current,
      layers: [
        ...createBaseLayers(),
        ...createOverlayLayers(),
      ],
      view: createDefaultView(),
    });

    mapRef.current = olMap;
    setMap(olMap);
  }, [targetRef]);

  return map;
}
