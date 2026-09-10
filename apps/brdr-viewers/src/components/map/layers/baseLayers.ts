import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import TileWMS from "ol/source/TileWMS";

const GRB_WMTS_BASE_URL =
  "https://geo.api.vlaanderen.be/GRB/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&STYLE=&FORMAT=image/png&TILEMATRIXSET=GoogleMapsVL&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}";

export const BASE_LAYER_KEY = "brdr-base-layer";
export const BASE_LAYER_OSM = "osm";
export const BASE_LAYER_GRB_COLOR = "grb-color";
export const BASE_LAYER_GRB_GRAY = "grb-gray";
export const BASE_LAYER_BRK_PDOK = "brk-pdok";
export const BASE_LAYER_BRK_LUCHTFOTO = "brk-luchtfoto";

export type BaseLayerId =
  | typeof BASE_LAYER_OSM
  | typeof BASE_LAYER_GRB_COLOR
  | typeof BASE_LAYER_GRB_GRAY
  | typeof BASE_LAYER_BRK_PDOK
  | typeof BASE_LAYER_BRK_LUCHTFOTO;

export type BaseLayerVisibility = Record<BaseLayerId, boolean>;

export const DEFAULT_BASE_LAYER_VISIBILITY: BaseLayerVisibility = {
  [BASE_LAYER_OSM]: false,
  [BASE_LAYER_GRB_COLOR]: false,
  [BASE_LAYER_GRB_GRAY]: true,
  [BASE_LAYER_BRK_PDOK]: false,
  [BASE_LAYER_BRK_LUCHTFOTO]: false,
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

function createBrkWmsSource() {
  return new TileWMS({
    url: "https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0",
    projection: "EPSG:28992",
    params: {
      SERVICE: "WMS",
      VERSION: "1.3.0",
      REQUEST: "GetMap",
      LAYERS: "Perceel",
      STYLES: "",
      FORMAT: "image/png",
      TRANSPARENT: true,
    },
    crossOrigin: "anonymous",
    attributions: "Bron: Kadastrale kaart (BRK), PDOK/Kadaster",
  });
}

function createLuchtfotoWmsSource() {
  return new TileWMS({
    url: "https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0",
    projection: "EPSG:28992",
    params: {
      SERVICE: "WMS",
      VERSION: "1.3.0",
      REQUEST: "GetMap",
      LAYERS: "Actueel_orthoHR",
      STYLES: "",
      FORMAT: "image/png",
      TRANSPARENT: true,
    },
    crossOrigin: "anonymous",
    attributions: "Bron: Luchtfoto RGB, PDOK",
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

  const brkPdok = new TileLayer({
    source: createBrkWmsSource(),
    visible: visibility[BASE_LAYER_BRK_PDOK],
  });
  brkPdok.set(BASE_LAYER_KEY, BASE_LAYER_BRK_PDOK);
  brkPdok.setZIndex(3);

  const brkLuchtfoto = new TileLayer({
    source: createLuchtfotoWmsSource(),
    visible: visibility[BASE_LAYER_BRK_LUCHTFOTO],
  });
  brkLuchtfoto.set(BASE_LAYER_KEY, BASE_LAYER_BRK_LUCHTFOTO);
  brkLuchtfoto.setZIndex(2);

  return [osm, grbColor, grbGray, brkLuchtfoto, brkPdok];
}
