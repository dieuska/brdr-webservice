import GeoJSON from "ol/format/GeoJSON";
import WKT from "ol/format/WKT";
import type OlGeometry from "ol/geom/Geometry";
import type { Geometry } from "../../types/brdr";
import type { BrdrSupportedCrs } from "../alignment/contracts";

export type ImportSourceCrs = BrdrSupportedCrs | "EPSG:4326";

const geoJsonFormat = new GeoJSON();
const wktFormat = new WKT();

function toGeometryObject(
  geometryText: string,
  sourceCrs: ImportSourceCrs,
  targetCrs: BrdrSupportedCrs
) {
  const normalized = geometryText.trim();
  if (!normalized) {
    throw new Error("Lege geometrie kan niet verwerkt worden.");
  }

  const geometry = wktFormat.readGeometry(normalized, {
    dataProjection: sourceCrs,
    featureProjection: targetCrs,
  });

  return geoJsonFormat.writeGeometryObject(geometry, {
    dataProjection: targetCrs,
    featureProjection: targetCrs,
  }) as Geometry;
}

function parseGeoJson(
  text: string,
  sourceCrs: ImportSourceCrs,
  targetCrs: BrdrSupportedCrs
) {
  const parsed = JSON.parse(text) as { type?: string };

  if (parsed?.type === "FeatureCollection") {
    const features = geoJsonFormat.readFeatures(parsed, {
      dataProjection: sourceCrs,
      featureProjection: targetCrs,
    });
    return features
      .map((feature) => feature.getGeometry())
      .filter((geometry): geometry is NonNullable<typeof geometry> => Boolean(geometry))
      .map((geometry) =>
        geoJsonFormat.writeGeometryObject(geometry, {
          dataProjection: targetCrs,
          featureProjection: targetCrs,
        }) as Geometry
      );
  }

  if (parsed?.type === "Feature") {
    const feature = geoJsonFormat.readFeature(parsed, {
      dataProjection: sourceCrs,
      featureProjection: targetCrs,
    }) as { getGeometry: () => OlGeometry | null };
    const geometry = feature.getGeometry();
    if (!geometry) return [];
    return [
      geoJsonFormat.writeGeometryObject(geometry, {
        dataProjection: targetCrs,
        featureProjection: targetCrs,
      }) as Geometry,
    ];
  }

  const geometry = geoJsonFormat.readGeometry(parsed, {
    dataProjection: sourceCrs,
    featureProjection: targetCrs,
  });
  return [
    geoJsonFormat.writeGeometryObject(geometry, {
      dataProjection: targetCrs,
      featureProjection: targetCrs,
    }) as Geometry,
  ];
}

function parseWkt(
  text: string,
  sourceCrs: ImportSourceCrs,
  targetCrs: BrdrSupportedCrs
) {
  const segments = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (segments.length <= 1) {
    return [toGeometryObject(text, sourceCrs, targetCrs)];
  }

  return segments.map((segment) =>
    toGeometryObject(segment, sourceCrs, targetCrs)
  );
}

export function parsePastedGeometries(
  text: string,
  sourceCrs: ImportSourceCrs,
  targetCrs: BrdrSupportedCrs
): Geometry[] {
  const normalized = text.trim();
  if (!normalized) {
    throw new Error("Plak eerst een WKT of GeoJSON.");
  }

  let geometries: Geometry[] = [];
  try {
    geometries = parseGeoJson(normalized, sourceCrs, targetCrs);
  } catch {
    geometries = parseWkt(normalized, sourceCrs, targetCrs);
  }

  if (geometries.length === 0) {
    throw new Error("Geen geldige geometrie gevonden.");
  }

  return geometries;
}
