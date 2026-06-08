import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import { Style, Fill, Stroke, Circle as CircleStyle } from "ol/style";
import type { Geometry } from "../../../types/brdr";
import type { BrdrStep } from "../../../types/brdr";
import type { BrdrSupportedCrs } from "../../alignment/contracts";

const format = new GeoJSON();
export const BRDR_LAYER_KEY = "brdr";

function createPointSymbol(fillColor: string) {
  return new CircleStyle({
    radius: 5,
    fill: new Fill({ color: fillColor }),
    stroke: new Stroke({ color: "#111827", width: 1 }),
  });
}

function createPredictionResultStyles() {
  return [
    new Style({
      stroke: new Stroke({
        color: "rgba(255,255,255,0.92)",
        width: 7,
      }),
      fill: new Fill({ color: "rgba(15,23,42,0.08)" }),
      image: new CircleStyle({
        radius: 8,
        fill: new Fill({ color: "#0f172a" }),
        stroke: new Stroke({ color: "rgba(255,255,255,0.95)", width: 3 }),
      }),
    }),
    new Style({
      stroke: new Stroke({
        color: "#0f172a",
        width: 3.2,
      }),
      fill: new Fill({ color: "rgba(15,23,42,0.12)" }),
      image: new CircleStyle({
        radius: 6,
        fill: new Fill({ color: "#0f172a" }),
        stroke: new Stroke({ color: "#f8fafc", width: 1.6 }),
      }),
    }),
    new Style({
      stroke: new Stroke({
        color: "#14b8a6",
        width: 1.4,
        lineDash: [10, 6],
      }),
      image: new CircleStyle({
        radius: 4,
        fill: new Fill({ color: "#14b8a6" }),
        stroke: new Stroke({ color: "#0f172a", width: 1 }),
      }),
    }),
  ];
}

function createVectorLayer(
  geometry: Geometry,
  crs: BrdrSupportedCrs,
  style: Style | Style[],
  zIndex: number
): VectorLayer<VectorSource> {
  return new VectorLayer({
    source: new VectorSource({
      features: format.readFeatures(
        { type: "Feature", geometry },
        {
          dataProjection: crs,
          featureProjection: crs,
        }
      ),
    }),
    style,
    zIndex,
  });
}

export function createBrdrLayers(step: BrdrStep, crs: BrdrSupportedCrs) {
  return createBrdrLayersWithOptions(step, { showDiffLayers: true }, crs);
}

export function createBrdrLayersWithOptions(
  step: BrdrStep,
  options: { showDiffLayers: boolean },
  crs: BrdrSupportedCrs
) {
  const layers = [
    createVectorLayer(
      step.result,
      crs,
      createPredictionResultStyles(),
      100
    ),
  ];

  if (!options.showDiffLayers) {
    return layers;
  }

  layers.push(
    createVectorLayer(
      step.result_diff_min,
      crs,
      new Style({
        stroke: new Stroke({ color: "rgba(255,0,0,0.95)", width: 3 }),
        fill: new Fill({ color: "rgba(255,0,0,0.5)" }),
        image: createPointSymbol("rgba(255,0,0,0.95)"),
      }),
      110
    ),
    createVectorLayer(
      step.result_diff_plus,
      crs,
      new Style({
        stroke: new Stroke({ color: "rgba(0,180,0,0.95)", width: 3 }),
        fill: new Fill({ color: "rgba(0,180,0,0.5)" }),
        image: createPointSymbol("rgba(0,180,0,0.95)"),
      }),
      120
    )
  );

  return layers;
}
