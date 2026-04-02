export type PolygonGeometry = {
  type: "Polygon";
  coordinates: number[][][];
};

export type MultiPolygonGeometry = {
  type: "MultiPolygon";
  coordinates: number[][][][];
};

export type Geometry = PolygonGeometry | MultiPolygonGeometry;

export interface BrdrStep {
  result: Geometry;
  result_diff_min: Geometry;
  result_diff_plus: Geometry;
}

export interface BrdrResponse {
  series: Record<string, BrdrStep>;
  diffs: Record<string, number>;
}

export interface BrdrFeature {
  type: "Feature";
  id: string;
  properties: Record<string, unknown>;
  geometry: Geometry;
}

export interface BrdrRequestBody {
  featurecollection: {
    type: "FeatureCollection";
    features: BrdrFeature[];
  };
  params: {
    crs: string;
    grb_type: string;
    full_reference_strategy: string;
  };
}
