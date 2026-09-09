import View from "ol/View";
import { transform } from "ol/proj";
import {
  DEFAULT_BRDR_CRS,
  assertSupportedCrs,
  type BrdrSupportedCrs,
} from "../alignment/contracts";

export function createDefaultView(
  crs: BrdrSupportedCrs = DEFAULT_BRDR_CRS,
  centerLonLat: [number, number] | undefined = undefined
) {
  assertSupportedCrs(crs);
  const defaultCenterLonLat =
    centerLonLat ?? (crs === "EPSG:28992" ? [5.3, 52.1] : [4.5, 51.0]);
  return new View({
    projection: crs,
    center: transform(defaultCenterLonLat, "EPSG:4326", crs),
    zoom: 10,
  });
}
