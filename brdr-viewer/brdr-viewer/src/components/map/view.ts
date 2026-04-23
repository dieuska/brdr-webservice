import View from "ol/View";
import { transform } from "ol/proj";
import {
  DEFAULT_BRDR_CRS,
  assertSupportedCrs,
  type BrdrSupportedCrs,
} from "../alignment/contracts";

export function createDefaultView(crs: BrdrSupportedCrs = DEFAULT_BRDR_CRS) {
  assertSupportedCrs(crs);
  return new View({
    projection: crs,
    center: transform([4.5, 51.0], "EPSG:4326", crs),
    zoom: 10,
  });
}
