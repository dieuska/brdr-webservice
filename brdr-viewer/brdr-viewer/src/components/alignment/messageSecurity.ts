import {
  BRDR_SUPPORTED_CRS,
  type BrdrSupportedCrs,
} from "./contracts";
import type { Geometry } from "../../types/brdr";

type GeometryType = Geometry["type"];

const GEOMETRY_TYPES: GeometryType[] = [
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPosition(value: unknown): value is number[] {
  return Array.isArray(value) && value.length >= 2 && value.every(isFiniteNumber);
}

function isPositionArray(value: unknown): value is number[][] {
  return Array.isArray(value) && value.every(isPosition);
}

function isPositionArrayArray(value: unknown): value is number[][][] {
  return Array.isArray(value) && value.every(isPositionArray);
}

function isPositionArrayArrayArray(value: unknown): value is number[][][][] {
  return Array.isArray(value) && value.every(isPositionArrayArray);
}

export function isGeometry(value: unknown): value is Geometry {
  if (!value || typeof value !== "object") return false;

  const geometry = value as { type?: unknown; coordinates?: unknown };
  if (
    typeof geometry.type !== "string" ||
    !GEOMETRY_TYPES.includes(geometry.type as GeometryType)
  ) {
    return false;
  }

  switch (geometry.type) {
    case "Point":
      return isPosition(geometry.coordinates);
    case "MultiPoint":
    case "LineString":
      return isPositionArray(geometry.coordinates);
    case "MultiLineString":
    case "Polygon":
      return isPositionArrayArray(geometry.coordinates);
    case "MultiPolygon":
      return isPositionArrayArrayArray(geometry.coordinates);
    default:
      return false;
  }
}

export interface AlignmentInitMessage {
  type: "BRDR_ALIGNMENT_INIT" | "BRDR_ALIGNMENT_UPDATE_GEOMETRY";
  payload: { crs: BrdrSupportedCrs; geometry: Geometry };
}

export interface AlignmentReadyMessage {
  type: "BRDR_ALIGNMENT_READY";
}

export interface AlignmentApplyMessage {
  type: "BRDR_ALIGNMENT_APPLY";
  payload: { geometry: Geometry };
}

export function isAlignmentInitMessage(
  value: unknown
): value is AlignmentInitMessage {
  if (!value || typeof value !== "object") return false;

  const message = value as { type?: unknown; payload?: unknown };
  if (
    message.type !== "BRDR_ALIGNMENT_INIT" &&
    message.type !== "BRDR_ALIGNMENT_UPDATE_GEOMETRY"
  ) {
    return false;
  }

  if (!message.payload || typeof message.payload !== "object") return false;

  const payload = message.payload as { crs?: unknown; geometry?: unknown };
  return (
    typeof payload.crs === "string" &&
    BRDR_SUPPORTED_CRS.includes(payload.crs as BrdrSupportedCrs) &&
    isGeometry(payload.geometry)
  );
}

export function isAlignmentReadyMessage(
  value: unknown
): value is AlignmentReadyMessage {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "BRDR_ALIGNMENT_READY"
  );
}

export function isAlignmentApplyMessage(
  value: unknown
): value is AlignmentApplyMessage {
  if (!value || typeof value !== "object") return false;

  const message = value as { type?: unknown; payload?: unknown };
  if (message.type !== "BRDR_ALIGNMENT_APPLY") return false;
  if (!message.payload || typeof message.payload !== "object") return false;

  return isGeometry((message.payload as { geometry?: unknown }).geometry);
}

export function isAllowedOrigin(value: string | null): value is string {
  if (!value) return false;

  try {
    const origin = new URL(value).origin;
    return origin === value && origin !== "null";
  } catch {
    return false;
  }
}

export function parseAllowedOriginsConfig(value: string | undefined): string[] | null {
  if (!value) return null;

  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .filter(isAllowedOrigin);

  return origins.length > 0 ? origins : null;
}

export function isOriginAllowedByConfig(
  origin: string,
  allowedOrigins: string[] | null
): boolean {
  if (!allowedOrigins) {
    return true;
  }

  return allowedOrigins.includes(origin);
}
