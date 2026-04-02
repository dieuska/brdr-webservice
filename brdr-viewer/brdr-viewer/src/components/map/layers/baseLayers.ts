import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";

export function createBaseLayers() {
  const osm = new TileLayer({
    source: new OSM(),
  });

  return [osm];
}
