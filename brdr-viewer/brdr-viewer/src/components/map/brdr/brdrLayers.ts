import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import { Style, Fill, Stroke } from "ol/style";
import type { Geometry } from "../../../types/brdr";
import type { BrdrStep } from "../../../types/brdr";

const format = new GeoJSON();
export const BRDR_LAYER_KEY = "brdr";

function createVectorLayer(
  geometry: Geometry,
  style: Style
): VectorLayer<VectorSource> {
  return new VectorLayer({
    source: new VectorSource({
      features: format.readFeatures(
        { type: "Feature", geometry },
        {
          dataProjection: "EPSG:31370",
          featureProjection: "EPSG:3857",
        }
      ),
    }),
    style,
  });
}

export function createBrdrLayers(step: BrdrStep) {
  return [
    createVectorLayer(
      step.result,
      new Style({
        stroke: new Stroke({ color: "#000", width: 2 }),
        fill: new Fill({ color: "rgba(0,0,0,0.15)" }),
      })
    ),
    createVectorLayer(
      step.result_diff_min,
      new Style({
        fill: new Fill({ color: "rgba(255,0,0,0.5)" }),
      })
    ),
    createVectorLayer(
      step.result_diff_plus,
      new Style({
        fill: new Fill({ color: "rgba(0,180,0,0.5)" }),
      })
    ),
  ];
}
