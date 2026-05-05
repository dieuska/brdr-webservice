export type PointGeometry = {
  type: "Point";
  coordinates: number[];
};

export type MultiPointGeometry = {
  type: "MultiPoint";
  coordinates: number[][];
};

export type LineStringGeometry = {
  type: "LineString";
  coordinates: number[][];
};

export type MultiLineStringGeometry = {
  type: "MultiLineString";
  coordinates: number[][][];
};

export type PolygonGeometry = {
  type: "Polygon";
  coordinates: number[][][];
};

export type MultiPolygonGeometry = {
  type: "MultiPolygon";
  coordinates: number[][][][];
};

export type Geometry =
  | PointGeometry
  | MultiPointGeometry
  | LineStringGeometry
  | MultiLineStringGeometry
  | PolygonGeometry
  | MultiPolygonGeometry;

export interface BrdrStep {
  result: Geometry;
  result_diff_min: Geometry;
  result_diff_plus: Geometry;
}

export interface BrdrResponse {
  series: Record<string, BrdrStep>;
  diffs: Record<string, number>;
  diff_metric?: "area" | "length" | "count";
  predictions: Record<string, boolean>;
  prediction_scores: Record<string, number>;
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
  };
}
