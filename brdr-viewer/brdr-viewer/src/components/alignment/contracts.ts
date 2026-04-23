import type { Geometry } from "../../types/brdr";

export const BRDR_CRS_31370 = "EPSG:31370" as const;
export const BRDR_CRS_3812 = "EPSG:3812" as const;
export const DEFAULT_BRDR_CRS = BRDR_CRS_3812;
export const BRDR_SUPPORTED_CRS = [BRDR_CRS_31370, BRDR_CRS_3812] as const;
export type BrdrSupportedCrs = (typeof BRDR_SUPPORTED_CRS)[number];

export interface BrdrAlignmentParams {
  crs: BrdrSupportedCrs;
  grb_type: string;
  full_reference_strategy: string;
  od_strategy?: string;
  snap_strategy?: string;
  max_relevant_distance?: number;
  processor?: string;
}

export interface UseBrdrStateOptions {
  crs: BrdrSupportedCrs;
  initialGeometry?: Geometry | null;
}

export function assertSupportedCrs(crs: string): asserts crs is BrdrSupportedCrs {
  if (!BRDR_SUPPORTED_CRS.includes(crs as BrdrSupportedCrs)) {
    throw new Error(
      `Unsupported CRS "${crs}". Supported values: ${BRDR_SUPPORTED_CRS.join(", ")}.`
    );
  }
}
