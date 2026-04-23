import View from "ol/View";
import { transform } from "ol/proj";

export function createDefaultView() {
  return new View({
    projection: "EPSG:31370",
    center: transform([4.5, 51.0], "EPSG:4326", "EPSG:31370"),
    zoom: 10,
  });
}
