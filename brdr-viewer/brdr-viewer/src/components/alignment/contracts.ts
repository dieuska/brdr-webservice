import type { Geometry } from "../../types/brdr";

export const BRDR_CRS_31370 = "EPSG:31370" as const;
export const BRDR_CRS_3812 = "EPSG:3812" as const;
export const BRDR_CRS_28992 = "EPSG:28992" as const;
export const DEFAULT_BRDR_CRS = BRDR_CRS_3812;
export const BRDR_SUPPORTED_CRS = [
  BRDR_CRS_31370,
  BRDR_CRS_3812,
  BRDR_CRS_28992,
] as const;
export type BrdrSupportedCrs = (typeof BRDR_SUPPORTED_CRS)[number];

export interface BrdrAlignmentParams {
  crs: BrdrSupportedCrs;
  reference_loader?: "grb" | "wfs" | "ogc_feature_api";
  grb_type: string;
  reference_url?: string;
  reference_id_property?: string;
  reference_typename?: string;
  reference_collection?: string;
  reference_partition?: number;
  reference_limit?: number;
  full_reference_strategy: string;
  od_strategy?: string;
  snap_strategy?: string;
  max_relevant_distance?: number;
  relevant_distance_step?: number;
  processor?: string;
}

export interface UseBrdrStateOptions {
  crs: BrdrSupportedCrs;
  initialGeometry?: Geometry | null;
  initialRequestParams?: Partial<BrdrAlignmentParams>;
}

export function assertSupportedCrs(crs: string): asserts crs is BrdrSupportedCrs {
  if (!BRDR_SUPPORTED_CRS.includes(crs as BrdrSupportedCrs)) {
    throw new Error(
      `Unsupported CRS "${crs}". Supported values: ${BRDR_SUPPORTED_CRS.join(", ")}.`
    );
  }
}
