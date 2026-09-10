import type { Geometry } from "../types/brdr";
import WKT from "ol/format/WKT";
import { transform } from "ol/proj";

export interface HeritageObject {
  uri: string;
  title: string;
  geometry: Geometry;
  sourceUrl: string;
}

const GEOMETRY_TYPES = new Set([
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
]);

function normalizeGeometry(geometry: Geometry): Geometry {
  const firstPosition = findFirstPosition(geometry.coordinates);
  if (!firstPosition || Math.abs(firstPosition[0]) > 180 || Math.abs(firstPosition[1]) > 90) return geometry;
  return { ...geometry, coordinates: mapCoordinates(geometry.coordinates, (position) => transform(position, "EPSG:4326", "EPSG:31370")) } as Geometry;
}

function findFirstPosition(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length >= 2 && value.every((item) => typeof item === "number")) return value as number[];
  for (const child of value) {
    const position = findFirstPosition(child);
    if (position) return position;
  }
  return null;
}

function mapCoordinates(value: unknown, mapper: (position: number[]) => number[]): unknown {
  if (!Array.isArray(value)) return value;
  if (value.length >= 2 && value.every((item) => typeof item === "number")) return mapper(value as number[]);
  return value.map((child) => mapCoordinates(child, mapper));
}

function findGeometry(value: unknown, seen = new Set<unknown>()): Geometry | null {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findGeometry(item, seen);
      if (result) return result;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["geometry", "geometrie", "geom", "shape", "spatialGeometry"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && /^\s*(MULTI)?(POLYGON|LINESTRING|POINT)/i.test(candidate)) {
      try {
        const parsed = new WKT().readGeometry(candidate, {
          dataProjection: "EPSG:31370",
          featureProjection: "EPSG:31370",
        });
        return normalizeGeometry({
          type: parsed.getType(),
          coordinates: (parsed as unknown as { getCoordinates: () => unknown }).getCoordinates(),
        } as Geometry);
      } catch {
        // Continue searching other response fields.
      }
    }
  }
  if (typeof record.type === "string" && GEOMETRY_TYPES.has(record.type) && record.coordinates) {
    return normalizeGeometry({ type: record.type, coordinates: record.coordinates } as Geometry);
  }
  for (const child of Object.values(record)) {
    const result = findGeometry(child, seen);
    if (result) return result;
  }
  return null;
}

function findTitle(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const title = findTitle(item);
      if (title) return title;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["title", "naam", "name", "label", "preferredLabel"]) {
    if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
  }
  for (const child of Object.values(record)) {
    const title = findTitle(child);
    if (title) return title;
  }
  return null;
}

function candidateUrls(uri: string): string[] {
  const normalized = uri.trim().replace(/\/$/, "");
  const match = normalized.match(/\/aanduidingsobjecten\/(\d+)$/i);
  if (!match) return [normalized];
  const id = match[1];
  return [
    `https://inventaris.onroerenderfgoed.be/api/aanduidingsobjecten/${id}`,
    `https://mercator.vlaanderen.be/raadpleegdienstenmercatorpubliek/ogc/features/v1/collections/ps%3Aps_vast_be/items/${id}?f=application%2Fgeo%2Bjson`,
    `https://geo.onroerenderfgoed.be/zoekdiensten/afbakeningen?uri=${encodeURIComponent(normalized)}&geef_geometrie=1`,
    `${normalized}?format=json`,
  ];
}

export async function fetchHeritageObject(uri: string): Promise<HeritageObject> {
  const urls = candidateUrls(uri);
  const failures: string[] = [];
  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json, application/geo+json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload: unknown = await response.json();
      const geometry = findGeometry(payload);
      if (!geometry) throw new Error("Geen geometrie in de response");
      return { uri, title: findTitle(payload) ?? `Aanduidingsobject ${uri.split("/").pop()}`, geometry, sourceUrl: url };
    } catch (error) {
      failures.push(`${url}: ${error instanceof Error ? error.message : "onbekende fout"}`);
    }
  }
  throw new Error(`Het erfgoedobject kon niet worden geladen. ${failures.join(" | ")}`);
}
