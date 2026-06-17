import { useEffect, useMemo, useRef } from "react";
import Map from "ol/Map";
import Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import type { Geometry as OlGeometry } from "ol/geom";
import Draw from "ol/interaction/Draw";
import VectorLayer from "ol/layer/Vector";
import { transformExtent } from "ol/proj";
import VectorSource from "ol/source/Vector";
import { bbox as bboxStrategy } from "ol/loadingstrategy";
import { createBaseLayers, DEFAULT_BASE_LAYER_VISIBILITY } from "../components/map/layers/baseLayers";
import { createDefaultView } from "../components/map/view";
import type { Geometry } from "../types/brdr";
import "../components/map/MapView.css";
import "ol/ol.css";
import { Circle as CircleStyle, Fill, Stroke, Style } from "ol/style";

const ADPF_COLLECTIONS_BASE =
  "https://geo.api.vlaanderen.be/Adpf/ogc/features/v1/collections";
const OGC_OUTPUT_CRS_31370 = "http://www.opengis.net/def/crs/EPSG/0/31370";
const OGC_OUTPUT_CRS_CRS84 = "http://www.opengis.net/def/crs/OGC/1.3/CRS84";
const OGC_RESPONSE_FORMAT = "application/json";
const OGC_FETCH_LIMIT = 5000;

const referenceStyle = new Style({
  stroke: new Stroke({
    color: "rgba(15, 23, 42, 0.5)",
    width: 1.15,
  }),
  fill: new Fill({
    color: "rgba(15, 23, 42, 0.06)",
  }),
});

const originalStyle = new Style({
  stroke: new Stroke({
    color: "rgba(30, 64, 175, 0.95)",
    width: 2,
    lineDash: [8, 5],
  }),
  fill: new Fill({
    color: "rgba(59, 130, 246, 0.08)",
  }),
});

const managedStyle = new Style({
  stroke: new Stroke({
    color: "rgba(22, 101, 52, 0.95)",
    width: 2.6,
  }),
  fill: new Fill({
    color: "rgba(34, 197, 94, 0.2)",
  }),
  image: new CircleStyle({
    radius: 6,
    fill: new Fill({ color: "rgba(22, 101, 52, 0.95)" }),
    stroke: new Stroke({ color: "#ffffff", width: 1.2 }),
  }),
});

const proposalStyle = new Style({
  stroke: new Stroke({
    color: "rgba(153, 27, 27, 0.95)",
    width: 2.6,
    lineDash: [10, 6],
  }),
  fill: new Fill({
    color: "rgba(239, 68, 68, 0.14)",
  }),
  image: new CircleStyle({
    radius: 6,
    fill: new Fill({ color: "rgba(185, 28, 28, 0.95)" }),
    stroke: new Stroke({ color: "#ffffff", width: 1.2 }),
  }),
});

const draftStyle = new Style({
  stroke: new Stroke({
    color: "rgba(202, 138, 4, 0.95)",
    width: 2.8,
  }),
  fill: new Fill({
    color: "rgba(250, 204, 21, 0.2)",
  }),
  image: new CircleStyle({
    radius: 6,
    fill: new Fill({ color: "rgba(202, 138, 4, 0.95)" }),
    stroke: new Stroke({ color: "#ffffff", width: 1.2 }),
  }),
});

interface Props {
  referenceCollectionId: string | null;
  originalGeometry: Geometry | null;
  managedGeometry: Geometry | null;
  proposalGeometry: Geometry | null;
  draftGeometry: Geometry | null;
  loading: boolean;
  drawRequestToken: number;
  onDrawn: (geometry: Geometry) => void;
}

function buildItemsUrl(collectionId: string, extent31370: number[]) {
  const [minX, minY, maxX, maxY] = extent31370;
  const bbox4326 = transformExtent(extent31370, "EPSG:31370", "EPSG:4326");
  const [lonMin, latMin, lonMax, latMax] = bbox4326;

  const paramsProjected = new URLSearchParams({
    f: OGC_RESPONSE_FORMAT,
    limit: String(OGC_FETCH_LIMIT),
    bbox: `${minX},${minY},${maxX},${maxY}`,
    "bbox-crs": OGC_OUTPUT_CRS_31370,
    crs: OGC_OUTPUT_CRS_31370,
  });

  const paramsCrs84 = new URLSearchParams({
    f: OGC_RESPONSE_FORMAT,
    limit: String(OGC_FETCH_LIMIT),
    bbox: `${lonMin},${latMin},${lonMax},${latMax}`,
    "bbox-crs": OGC_OUTPUT_CRS_CRS84,
    crs: OGC_OUTPUT_CRS_CRS84,
  });

  const base = `${ADPF_COLLECTIONS_BASE}/${encodeURIComponent(collectionId)}/items`;
  return [
    { url: `${base}?${paramsProjected.toString()}`, dataProjection: "EPSG:31370" },
    { url: `${base}?${paramsCrs84.toString()}`, dataProjection: "EPSG:4326" },
  ];
}

function createReferenceSource(collectionId: string | null) {
  const format = new GeoJSON();
  const source = new VectorSource({
    format,
    strategy: bboxStrategy,
  });

  source.setLoader(async (extent) => {
    if (!collectionId) {
      source.removeLoadedExtent(extent);
      return;
    }

    let loaded = false;
    for (const request of buildItemsUrl(collectionId, extent)) {
      try {
        const response = await fetch(request.url);
        if (!response.ok) {
          continue;
        }
        const payload = await response.json();
        const features = format.readFeatures(payload, {
          dataProjection: request.dataProjection,
          featureProjection: "EPSG:31370",
        });
        source.addFeatures(features);
        loaded = true;
        break;
      } catch {
        // Try next URL shape.
      }
    }

    if (!loaded) {
      source.removeLoadedExtent(extent);
    }
  });

  return source;
}

function setSingleGeometryFeature(
  source: VectorSource | null,
  geometry: Geometry | null,
  format: GeoJSON
) {
  if (!source) return;
  source.clear();
  if (!geometry) return;
  const feature = format.readFeature(
    { type: "Feature", geometry },
    {
      dataProjection: "EPSG:31370",
      featureProjection: "EPSG:31370",
    }
  ) as Feature<OlGeometry>;
  source.addFeature(feature);
}

export function GeoLifecycleMap({
  referenceCollectionId,
  originalGeometry,
  managedGeometry,
  proposalGeometry,
  draftGeometry,
  loading,
  drawRequestToken,
  onDrawn,
}: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const drawRef = useRef<Draw | null>(null);
  const fittedRef = useRef(false);
  const lastDrawTokenRef = useRef(-1);
  const referenceLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const originalSourceRef = useRef<VectorSource | null>(null);
  const managedSourceRef = useRef<VectorSource | null>(null);
  const proposalSourceRef = useRef<VectorSource | null>(null);
  const draftSourceRef = useRef<VectorSource | null>(null);
  const format = useMemo(() => new GeoJSON(), []);

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;

    const originalSource = new VectorSource();
    const managedSource = new VectorSource();
    const proposalSource = new VectorSource();
    const draftSource = new VectorSource();
    const referenceLayer = new VectorLayer({
      source: createReferenceSource(referenceCollectionId),
      style: referenceStyle,
    });
    referenceLayer.setZIndex(8);

    const map = new Map({
      target: divRef.current,
      layers: [
        ...createBaseLayers(DEFAULT_BASE_LAYER_VISIBILITY),
        referenceLayer,
        new VectorLayer({ source: originalSource, style: originalStyle, zIndex: 20 }),
        new VectorLayer({ source: managedSource, style: managedStyle, zIndex: 21 }),
        new VectorLayer({ source: proposalSource, style: proposalStyle, zIndex: 22 }),
        new VectorLayer({ source: draftSource, style: draftStyle, zIndex: 23 }),
      ],
      view: createDefaultView("EPSG:31370"),
    });

    mapRef.current = map;
    referenceLayerRef.current = referenceLayer;
    originalSourceRef.current = originalSource;
    managedSourceRef.current = managedSource;
    proposalSourceRef.current = proposalSource;
    draftSourceRef.current = draftSource;

    return () => {
      if (drawRef.current) {
        map.removeInteraction(drawRef.current);
      }
      map.setTarget(undefined);
      mapRef.current = null;
      referenceLayerRef.current = null;
      originalSourceRef.current = null;
      managedSourceRef.current = null;
      proposalSourceRef.current = null;
      draftSourceRef.current = null;
    };
  }, [format, referenceCollectionId]);

  useEffect(() => {
    if (!referenceLayerRef.current) return;
    referenceLayerRef.current.setSource(createReferenceSource(referenceCollectionId));
  }, [referenceCollectionId]);

  useEffect(() => {
    setSingleGeometryFeature(originalSourceRef.current, originalGeometry, format);
    setSingleGeometryFeature(managedSourceRef.current, managedGeometry, format);
    setSingleGeometryFeature(proposalSourceRef.current, proposalGeometry, format);
    setSingleGeometryFeature(draftSourceRef.current, draftGeometry, format);
  }, [draftGeometry, format, managedGeometry, originalGeometry, proposalGeometry]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const focusGeometry = proposalGeometry ?? managedGeometry ?? draftGeometry ?? originalGeometry;
    if (!focusGeometry) return;

    const feature = format.readFeature(
      { type: "Feature", geometry: focusGeometry },
      {
        dataProjection: "EPSG:31370",
        featureProjection: "EPSG:31370",
      }
    ) as Feature<OlGeometry>;
    const extent = feature.getGeometry()?.getExtent();
    if (!extent || !extent.every(Number.isFinite)) return;

    if (!fittedRef.current) {
      map.getView().fit(extent, {
        padding: [48, 48, 48, 48],
        maxZoom: 20,
      });
      fittedRef.current = true;
    }
  }, [draftGeometry, format, managedGeometry, originalGeometry, proposalGeometry]);

  useEffect(() => {
    const map = mapRef.current;
    const source = draftSourceRef.current;
    if (!map || !source) return;
    if (drawRequestToken === lastDrawTokenRef.current) return;
    lastDrawTokenRef.current = drawRequestToken;

    if (drawRef.current) {
      map.removeInteraction(drawRef.current);
      drawRef.current = null;
    }

    const draw = new Draw({
      source,
      type: "Polygon",
    });

    draw.on("drawstart", () => {
      source.clear();
    });

    draw.on("drawend", (event) => {
      const geometry = event.feature.getGeometry();
      if (!geometry) return;
      const nextGeometry = format.writeGeometryObject(geometry, {
        dataProjection: "EPSG:31370",
        featureProjection: "EPSG:31370",
      }) as Geometry;
      onDrawn(nextGeometry);
    });

    drawRef.current = draw;
    map.addInteraction(draw);
  }, [drawRequestToken, format, onDrawn]);

  return (
    <div className="map-container-wrapper">
      <div ref={divRef} className="map-container" />
      {loading && (
        <div className="map-loading-overlay" role="status" aria-live="polite">
          Lifecycle wordt herberekend...
        </div>
      )}
      <div className="map-draw-hint">
        Teken een polygon als startgeometrie. Groen = beheerde versie, rood = voorstel, blauw = oorspronkelijke input.
      </div>
    </div>
  );
}
