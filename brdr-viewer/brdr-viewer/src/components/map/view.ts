import View from "ol/View";

export function createDefaultView() {
  return new View({
    projection: "EPSG:3857",
    center: [0, 0],
    zoom: 2,
  });
}
