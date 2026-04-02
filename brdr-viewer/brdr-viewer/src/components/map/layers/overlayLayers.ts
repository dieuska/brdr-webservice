import TileLayer from "ol/layer/Tile";
import TileWMS from "ol/source/TileWMS";

export function createOverlayLayers() {
  const grbPercelen = new TileLayer({
    source: new TileWMS({
      url: "https://geo.api.vlaanderen.be/GRB/wms",
      params: {
        SERVICE: "WMS",
        VERSION: "1.3.0",
        REQUEST: "GetMap",
        LAYERS: "GRB_ADP",
        STYLES: "",
        FORMAT: "image/png",
        TRANSPARENT: true,
      },
      crossOrigin: "anonymous",
    }),
    opacity: 0.6,
  });

  return [grbPercelen];
}
