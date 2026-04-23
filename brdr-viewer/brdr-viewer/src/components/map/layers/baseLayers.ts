import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";

const GRB_WMTS_BASE_URL =
  "https://geo.api.vlaanderen.be/GRB/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&STYLE=&FORMAT=image/png&TILEMATRIXSET=GoogleMapsVL&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}";

export const BASE_LAYER_KEY = "brdr-base-layer";
export const BASE_LAYER_OSM = "osm";
export const BASE_LAYER_GRB_COLOR = "grb-color";
export const BASE_LAYER_GRB_GRAY = "grb-gray";

export type BaseLayerId =
  | typeof BASE_LAYER_OSM
  | typeof BASE_LAYER_GRB_COLOR
  | typeof BASE_LAYER_GRB_GRAY;

export type BaseLayerVisibility = Record<BaseLayerId, boolean>;

export const DEFAULT_BASE_LAYER_VISIBILITY: BaseLayerVisibility = {
  [BASE_LAYER_OSM]: false,
  [BASE_LAYER_GRB_COLOR]: false,
  [BASE_LAYER_GRB_GRAY]: true,
};

function createGrbWmtsSource(layerId: "grb_bsk" | "grb_bsk_grijs") {
  return new XYZ({
    projection: "EPSG:3857",
    url: `${GRB_WMTS_BASE_URL}&LAYER=${layerId}`,
    crossOrigin: "anonymous",
    attributions:
      "Bron: Grootschalig Referentie Bestand Vlaanderen, Digitaal Vlaanderen",
  });
}

export function createBaseLayers(visibility = DEFAULT_BASE_LAYER_VISIBILITY) {
  const osm = new TileLayer({
    source: new OSM(),
    visible: visibility[BASE_LAYER_OSM],
  });
  osm.set(BASE_LAYER_KEY, BASE_LAYER_OSM);
  osm.setZIndex(0);

  const grbColor = new TileLayer({
    source: createGrbWmtsSource("grb_bsk"),
    visible: visibility[BASE_LAYER_GRB_COLOR],
  });
  grbColor.set(BASE_LAYER_KEY, BASE_LAYER_GRB_COLOR);
  grbColor.setZIndex(1);

  const grbGray = new TileLayer({
    source: createGrbWmtsSource("grb_bsk_grijs"),
    visible: visibility[BASE_LAYER_GRB_GRAY],
    opacity: 0.45,
  });
  grbGray.set(BASE_LAYER_KEY, BASE_LAYER_GRB_GRAY);
  grbGray.setZIndex(2);

  return [osm, grbColor, grbGray];
}
