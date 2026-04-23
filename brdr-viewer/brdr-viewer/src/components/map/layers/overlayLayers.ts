import type { Extent } from "ol/extent";
import { transformExtent } from "ol/proj";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import { bbox as bboxStrategy } from "ol/loadingstrategy";
import { Circle as CircleStyle, Fill, Stroke, Style } from "ol/style";
import {
  DEFAULT_BRDR_CRS,
  assertSupportedCrs,
  type BrdrSupportedCrs,
} from "../../alignment/contracts";

const OGC_COLLECTIONS_BASE =
  "https://geo.api.vlaanderen.be/GRB/ogc/features/v1/collections";
const OGC_OUTPUT_CRS_31370 = "http://www.opengis.net/def/crs/EPSG/0/31370";
const OGC_OUTPUT_CRS_3812 = "http://www.opengis.net/def/crs/EPSG/0/3812";
const OGC_OUTPUT_CRS_CRS84 = "http://www.opengis.net/def/crs/OGC/1.3/CRS84";
const OGC_RESPONSE_FORMAT = "application/json";
const OGC_FETCH_LIMIT = 5000;
const OGC_REFERENCE_MIN_ZOOM = 16;

export const GRB_REFERENCE_LAYER_KEY = "brdr-grb-reference-layer";
export const GRB_REFERENCE_LAYER_LABEL_KEY = "brdr-grb-reference-layer-label";
let collectionsPromise: Promise<string[]> | null = null;

const SPECIAL_COLLECTION_BY_LABEL: Record<string, string> = {
  "GRB - Adres - adres": "Adres",
  "GRB - AdresLabel - adreslabel": "AdresLabel",
  "GRB - IngeschetstGebouw - ingeschetst gebouw": "IngeschetstGebouw",
  "GRB - Wegknoop - wegknoop": "Wegknoop",
  "GRB - Wegsegment - wegsegment": "Wegsegment",
};

const referenceStyle = new Style({
  stroke: new Stroke({
    color: "rgba(17,24,39,0.65)",
    width: 1.3,
  }),
  fill: new Fill({
    color: "rgba(17,24,39,0.09)",
  }),
  image: new CircleStyle({
    radius: 4,
    fill: new Fill({ color: "rgba(17,24,39,0.9)" }),
    stroke: new Stroke({ color: "#ffffff", width: 1 }),
  }),
});

export function createOverlayLayers(
  grbTypeLabels?: string[],
  crs: BrdrSupportedCrs = DEFAULT_BRDR_CRS
) {
  assertSupportedCrs(crs);
  const labels = normalizeGrbTypeLabels(grbTypeLabels);
  return labels.map((label) => {
    const referenceLayer = new VectorLayer({
      source: createReferenceSource(label, crs),
      style: referenceStyle,
      minZoom: OGC_REFERENCE_MIN_ZOOM,
    });
    referenceLayer.set(GRB_REFERENCE_LAYER_KEY, true);
    referenceLayer.set(GRB_REFERENCE_LAYER_LABEL_KEY, label);
    referenceLayer.setZIndex(10);
    return referenceLayer;
  });
}

function createReferenceSource(
  grbTypeLabel?: string,
  crs: BrdrSupportedCrs = DEFAULT_BRDR_CRS
) {
  const format = new GeoJSON();
  const collectionCandidates = resolveCollectionCandidates(grbTypeLabel);
  const source = new VectorSource({
    format,
    strategy: bboxStrategy,
  });

  source.setLoader(async (extent: Extent) => {
      const availableCollections = await getAvailableCollections();
      const mappedCandidates = mapToAvailableCollections(
        collectionCandidates,
        availableCollections
      );

      let loaded = false;
      for (const collection of mappedCandidates) {
        const requests = buildItemsRequests(collection, extent, crs);
        for (const request of requests) {
          try {
            const response = await fetch(request.url);
            if (!response.ok) {
              continue;
            }

            const payload = await response.json();
            const features = format.readFeatures(payload, {
              dataProjection: request.dataProjection,
              featureProjection: crs,
            });
            source.addFeatures(features);
            loaded = true;
            break;
          } catch {
            // Try the next URL variant.
          }
        }
        if (loaded) {
          break;
        }
      }

      if (!loaded) {
        source.removeLoadedExtent(extent);
      }
  });

  return source;
}

function buildItemsRequests(
  collection: string,
  bbox31370: Extent,
  crs: BrdrSupportedCrs
) {
  const [minX, minY, maxX, maxY] = bbox31370;
  const bbox4326 = transformExtent(bbox31370, crs, "EPSG:4326");
  const [lonMin, latMin, lonMax, latMax] = bbox4326;
  const crsUri = crs === "EPSG:3812" ? OGC_OUTPUT_CRS_3812 : OGC_OUTPUT_CRS_31370;

  const paramsProjected = new URLSearchParams({
    f: OGC_RESPONSE_FORMAT,
    limit: String(OGC_FETCH_LIMIT),
    bbox: `${minX},${minY},${maxX},${maxY}`,
    "bbox-crs": crsUri,
    crs: crsUri,
  });

  const paramsCrs84 = new URLSearchParams({
    f: OGC_RESPONSE_FORMAT,
    limit: String(OGC_FETCH_LIMIT),
    bbox: `${lonMin},${latMin},${lonMax},${latMax}`,
    "bbox-crs": OGC_OUTPUT_CRS_CRS84,
    crs: OGC_OUTPUT_CRS_CRS84,
  });

  const base = `${OGC_COLLECTIONS_BASE}/${encodeURIComponent(collection)}/items`;
  return [
    { url: `${base}?${paramsProjected.toString()}`, dataProjection: crs },
    { url: `${base}?${paramsCrs84.toString()}`, dataProjection: "EPSG:4326" },
  ];
}

function resolveCollectionCandidates(grbTypeLabel?: string) {
  if (!grbTypeLabel) {
    return ["ADP"];
  }

  const explicit = SPECIAL_COLLECTION_BY_LABEL[grbTypeLabel];
  if (explicit) {
    return withCasingVariants(explicit);
  }

  const segments = grbTypeLabel.split(" - ").map((segment) => segment.trim());
  const middleSegment = segments.length >= 2 ? segments[1] : grbTypeLabel;
  const compactSegment = middleSegment.replace(/\s+/g, "");

  return Array.from(
    new Set([
      ...withCasingVariants(middleSegment),
      ...withCasingVariants(compactSegment),
      ...withCasingVariants(grbTypeLabel),
    ])
  );
}

function normalizeGrbTypeLabels(grbTypeLabels?: string[]) {
  if (!grbTypeLabels) {
    return ["GRB - ADP - administratief perceel"];
  }
  if (grbTypeLabels.length === 0) {
    return [];
  }

  return Array.from(
    new Set(grbTypeLabels.map((label) => label.trim()).filter(Boolean))
  );
}

function withCasingVariants(value: string) {
  const lower = value.toLowerCase();
  const upper = value.toUpperCase();
  const capitalized = lower.charAt(0).toUpperCase() + lower.slice(1);
  return [value, lower, upper, capitalized];
}

function mapToAvailableCollections(candidates: string[], available: string[]) {
  if (available.length === 0) {
    return candidates;
  }

  const availableByNormalized = new Map(
    available.map((id) => [normalizeCollectionId(id), id])
  );

  const mapped = candidates
    .map((candidate) => availableByNormalized.get(normalizeCollectionId(candidate)))
    .filter((value): value is string => Boolean(value));

  return mapped.length > 0 ? Array.from(new Set(mapped)) : candidates;
}

function normalizeCollectionId(value: string) {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

async function getAvailableCollections() {
  if (!collectionsPromise) {
    collectionsPromise = fetch(`${OGC_COLLECTIONS_BASE}?f=application/json`)
      .then(async (response) => {
        if (!response.ok) {
          return [];
        }
        const payload = await response.json();
        const collections = Array.isArray(payload?.collections)
          ? payload.collections
          : [];
        return collections
          .map((collection: { id?: unknown }) =>
            typeof collection?.id === "string" ? collection.id : null
          )
          .filter((id: string | null): id is string => Boolean(id));
      })
      .catch(() => []);
  }

  return collectionsPromise;
}
