import numpy as np
import logging
import os
import json
import re
import requests
import uvicorn
from typing import Any, Optional, Literal
from brdr.be.grb.enums import GRBType
from brdr.be.grb.loader import GRBActualLoader
from brdr.configs import ProcessorConfig, AlignerConfig
from brdr.enums import OpenDomainStrategy, FullReferenceStrategy, AlignerResultType
from brdr.processor import (
    AlignerGeometryProcessor,
    DieussaertGeometryProcessor,
    NetworkGeometryProcessor,
    SnapGeometryProcessor,
    TopologyProcessor,
)
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from shapely.geometry import shape

from brdr.aligner import Aligner

from brdr.loader import DictLoader, WFSReferenceLoader, OGCFeatureAPIReferenceLoader
from brdr_webservice_typings import (
    AdpfCollectionsResponse,
    AdpfCollectionSummary,
    ResponseBody,
    RequestBody,
    ViewerResponse,
)

port = int(os.environ.get("BRDR_PORT", "80"))
host = "0.0.0.0"

app = FastAPI(
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)
logger = logging.getLogger(__name__)
ADPF_COLLECTIONS_URL = (
    "https://geo.api.vlaanderen.be/Adpf/ogc/features/v1/collections"
)
ADPF_REFERENCE_ID_PROPERTY = "CAPAKEY"
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("BRDR_CORS_ORIGINS", "").split(",") if os.environ.get("BRDR_CORS_ORIGINS") else [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

frontend_dist_dir = os.path.join(os.path.dirname(__file__), "frontend_dist")
local_viewer_dist_dir = os.path.join(
    os.path.dirname(__file__), "brdr-viewer", "brdr-viewer", "dist"
)

viewer_static_dir = None
for candidate in (frontend_dist_dir, local_viewer_dist_dir):
    if os.path.isdir(candidate):
        viewer_static_dir = candidate
        break

if viewer_static_dir:
    legacy_assets_dir = os.path.join(viewer_static_dir, "assets")
    if os.path.isdir(legacy_assets_dir):
        app.mount("/assets", StaticFiles(directory=legacy_assets_dir), name="viewer-assets")


def _viewer_html_file(filename: str) -> str:
    if not viewer_static_dir:
        raise HTTPException(status_code=404, detail="Viewer assets not found")
    path = os.path.join(viewer_static_dir, filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail=f"Missing viewer asset: {filename}")
    return path


def _format_distance_key(value: Any) -> str:
    return f"{float(value):.1f}"


def _extract_distance_data(
    feature_collection: dict[str, Any], selected_feature_id: Any
) -> dict[str, dict[str, Any]]:
    distance_data: dict[str, dict[str, Any]] = {}
    for feature in feature_collection.get("features", []):
        properties = feature.get("properties", {}) or {}
        feature_ids = (
            feature.get("id"),
            properties.get("id"),
            properties.get("brdr_id"),
        )
        if not any(str(candidate) == str(selected_feature_id) for candidate in feature_ids if candidate is not None):
            continue

        relevant_distance = properties.get("brdr_relevant_distance")
        if relevant_distance is None:
            continue

        key = _format_distance_key(relevant_distance)
        distance_data[key] = {
            "geometry": feature.get("geometry"),
            "properties": properties,
            "diff_area": properties.get("brdr_diff_area"),
            "evaluation": properties.get("brdr_evaluation"),
            "prediction_score": properties.get("brdr_prediction_score"),
        }

    return distance_data


def _empty_geometry_like(geometry: dict[str, Any]) -> dict[str, Any]:
    geom_type = geometry.get("type")
    coordinates = geometry.get("coordinates", [])

    base_point = [0.0, 0.0]
    try:
        if geom_type == "Point":
            base_point = coordinates
        elif geom_type == "MultiPoint":
            base_point = coordinates[0]
        elif geom_type == "LineString":
            base_point = coordinates[0]
        elif geom_type == "MultiLineString":
            base_point = coordinates[0][0]
        elif geom_type == "MultiPolygon":
            base_point = coordinates[0][0][0]
        else:
            base_point = coordinates[0][0]
    except (IndexError, TypeError):
        pass

    if geom_type == "Point":
        return {"type": "Point", "coordinates": base_point}
    if geom_type == "MultiPoint":
        return {"type": "MultiPoint", "coordinates": [base_point]}
    if geom_type == "LineString":
        return {"type": "LineString", "coordinates": [base_point, base_point]}
    if geom_type == "MultiLineString":
        return {"type": "MultiLineString", "coordinates": [[base_point, base_point]]}

    ring = [base_point, base_point, base_point, base_point]
    if geom_type == "MultiPolygon":
        return {"type": "MultiPolygon", "coordinates": [[ring]]}
    return {"type": "Polygon", "coordinates": [ring]}


def _safe_geometry_area(geometry: Optional[dict[str, Any]]) -> float:
    if not geometry:
        return 0.0
    try:
        return float(shape(geometry).area)
    except Exception:
        return 0.0


def _safe_float(value: Any) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _diff_metric_for_geometry(
    geometry: Optional[dict[str, Any]],
) -> Literal["area", "length", "count"]:
    geom_type = (geometry or {}).get("type")
    if geom_type in ("Polygon", "MultiPolygon"):
        return "area"
    if geom_type in ("LineString", "MultiLineString"):
        return "length"
    return "count"


def _safe_geometry_measure(
    geometry: Optional[dict[str, Any]],
    metric: Literal["area", "length", "count"],
) -> float:
    if not geometry:
        return 0.0
    try:
        geom = shape(geometry)
        if metric == "area":
            return float(geom.area)
        if metric == "length":
            return float(geom.length)
        if geom.geom_type == "Point":
            return 1.0
        if geom.geom_type == "MultiPoint":
            return float(len(getattr(geom, "geoms", [])))
        return 0.0
    except Exception:
        return 0.0


def _extract_diff_value_from_properties(
    properties: dict[str, Any],
    metric: Literal["area", "length", "count"],
) -> Optional[float]:
    metric_candidates = {
        # Prefer BRDR internal index metrics first (used during evaluation/prediction),
        # then fall back to legacy/public diff fields.
        "area": [
            "brdr_sym_diff_area_index",
            "brdr_diff_area_index",
            "brdr_diff_area",
        ],
        "length": [
            "brdr_diff_length_index",
            "brdr_diff_length",
            "brdr_diff_perimeter",
        ],
        "count": [
            "brdr_diff_count",
            "brdr_diff_points",
            "brdr_diff_point_count",
        ],
    }

    for key in metric_candidates[metric]:
        numeric = _safe_float(properties.get(key))
        if numeric is not None:
            return abs(numeric)

    if metric == "area":
        return None

    for key, value in properties.items():
        if not key.startswith("brdr_diff_"):
            continue
        numeric = _safe_float(value)
        if numeric is not None:
            return abs(numeric)

    return None


def _is_prediction_step(evaluation: Any, prediction_score: Any) -> bool:
    if isinstance(evaluation, str) and "prediction" in evaluation.lower():
        return True
    if prediction_score is not None:
        try:
            return float(prediction_score) > 0
        except (TypeError, ValueError):
            return False
    return False


def _parse_brdr_metadata(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def build_viewer_response(
    actualiser_result: dict[str, Any],
    feature_id: Optional[str] = None,
    include_metadata: bool = False,
) -> dict[str, Any]:
    result_fc = actualiser_result.get("result", {}) or {}
    result_features = result_fc.get("features", [])
    if not result_features:
        raise ValueError("No result features available")

    selected_feature_id: Any = feature_id
    if selected_feature_id is None:
        available_ids = []
        for feature in result_features:
            properties = feature.get("properties", {}) or {}
            candidate_id = (
                feature.get("id")
                or properties.get("id")
                or properties.get("brdr_id")
            )
            if candidate_id is not None:
                available_ids.append(candidate_id)
        available_unique_ids = list(dict.fromkeys(available_ids))
        if len(available_unique_ids) > 1:
            raise ValueError(
                "Multiple input features detected; pass feature_id query parameter"
            )
        selected_feature_id = available_unique_ids[0] if available_unique_ids else None

    if selected_feature_id is None:
        raise ValueError("Could not determine feature ID for viewer response")

    result_by_distance = _extract_distance_data(
        actualiser_result.get("result", {}) or {}, selected_feature_id
    )
    diff_min_by_distance = _extract_distance_data(
        actualiser_result.get("result_diff_min", {}) or {}, selected_feature_id
    )
    diff_plus_by_distance = _extract_distance_data(
        actualiser_result.get("result_diff_plus", {}) or {}, selected_feature_id
    )

    if not result_by_distance:
        raise ValueError(f"No results found for feature_id '{selected_feature_id}'")

    ordered_distances = sorted(result_by_distance.keys(), key=float)
    diff_metric: Literal["area", "length", "count"] = _diff_metric_for_geometry(
        result_by_distance[ordered_distances[0]].get("geometry")
    )
    series = {}
    diffs = {}
    predictions = {}
    prediction_scores = {}
    evaluations = {}
    metadata = {} if include_metadata else None

    for distance_key in ordered_distances:
        result_geometry = result_by_distance[distance_key]["geometry"]
        if result_geometry is None:
            continue

        diff_min_geometry = diff_min_by_distance.get(distance_key, {}).get("geometry")
        diff_plus_geometry = diff_plus_by_distance.get(distance_key, {}).get("geometry")

        fallback_geometry = _empty_geometry_like(result_geometry)
        series[distance_key] = {
            "result": result_geometry,
            "result_diff_min": diff_min_geometry or fallback_geometry,
            "result_diff_plus": diff_plus_geometry or fallback_geometry,
        }

        numeric_diff_value = _extract_diff_value_from_properties(
            result_by_distance[distance_key].get("properties", {}) or {},
            diff_metric,
        )

        diffs[distance_key] = numeric_diff_value or 0.0
        predictions[distance_key] = _is_prediction_step(
            result_by_distance[distance_key].get("evaluation"),
            result_by_distance[distance_key].get("prediction_score"),
        )
        evaluation = result_by_distance[distance_key].get("evaluation")
        evaluations[distance_key] = str(evaluation) if evaluation is not None else None
        try:
            prediction_scores[distance_key] = float(
                result_by_distance[distance_key].get("prediction_score") or 0.0
            )
        except (TypeError, ValueError):
            prediction_scores[distance_key] = 0.0

        if include_metadata:
            metadata[distance_key] = _parse_brdr_metadata(
                (result_by_distance[distance_key].get("properties") or {}).get(
                    "brdr_metadata"
                )
            )

    if not series:
        raise ValueError(f"No geometries found for feature_id '{selected_feature_id}'")

    response = {
        "series": series,
        "diffs": diffs,
        "diff_metric": diff_metric,
        "predictions": predictions,
        "prediction_scores": prediction_scores,
        "evaluations": evaluations,
    }
    if include_metadata:
        response["metadata"] = metadata
    return response


def calculate_alignment_geojson(
    request_body: RequestBody,
    result_type: AlignerResultType = AlignerResultType.EVALUATED_PREDICTIONS,
    include_metadata: bool = False,
) -> dict[str, Any]:
    params = request_body.params

    max_relevant_distance = (
        params.max_relevant_distance
        if params and params.max_relevant_distance is not None
        else 10.0
    )
    relevant_distance_step = (
        params.relevant_distance_step
        if params and params.relevant_distance_step
        else 0.2
    )
    max_relevant_distance = min(float(max_relevant_distance), 25.0)
    relevant_distance_step = max(float(relevant_distance_step), 0.01)
    max_centimeters = max(int(round(max_relevant_distance * 100)), 1)
    step_centimeters = max(int(round(relevant_distance_step * 100)), 1)
    relevant_distances = [
        round(k / 100, 2)
        for k in range(0, max_centimeters + 1, step_centimeters)
    ]
    rounded_max_distance = round(float(max_relevant_distance), 2)
    if relevant_distances[-1] != rounded_max_distance:
        relevant_distances.append(rounded_max_distance)
    crs = params.crs if params and params.crs else "EPSG:31370"
    threshold_overlap_percentage = 50
    od_strategy = (
        params.od_strategy
        if params and params.od_strategy
        else OpenDomainStrategy.SNAP_ALL_SIDE
    )
    snap_strategy = (
        params.snap_strategy
        if params and params.snap_strategy
        else None
    )
    processor_name = (
        params.processor
        if params and params.processor
        else "AlignerGeometryProcessor"
    )
    area_limit = 100000
    grb_type = params.grb_type if params and params.grb_type else GRBType.ADP
    reference_loader = params.reference_loader if params and params.reference_loader else "grb"
    reference_partition = (
        params.reference_partition
        if params and params.reference_partition
        else 1000
    )
    reference_limit = (
        params.reference_limit
        if params and params.reference_limit
        else 10000
    )
    full_strategy = (
        params.full_reference_strategy
        if params and params.full_reference_strategy
        else FullReferenceStrategy.PREFER_FULL_REFERENCE
    )

    data_dict = {}
    data_dict_properties = {}
    for f in request_body.featurecollection.features:
        data_dict[f.id] = shape(f.geometry.model_dump())
        data_dict_properties[f.id] = _normalize_request_properties(f.properties)

    processor_config = ProcessorConfig()
    processor_config.od_strategy = od_strategy
    if snap_strategy is not None:
        processor_config.snap_strategy = snap_strategy
    processor_config.threshold_overlap_percentage = threshold_overlap_percentage
    processor_config.area_limit = area_limit

    processor_map = {
        "AlignerGeometryProcessor": AlignerGeometryProcessor,
        "DieussaertGeometryProcessor": DieussaertGeometryProcessor,
        "NetworkGeometryProcessor": NetworkGeometryProcessor,
        "SnapGeometryProcessor": SnapGeometryProcessor,
        "TopologyProcessor": TopologyProcessor,
    }
    processor_class = processor_map.get(processor_name, AlignerGeometryProcessor)
    processor = processor_class(config=processor_config)
    aligner_config = AlignerConfig()
    if include_metadata:
        aligner_config.log_metadata = True
        aligner_config.add_observations = True
    aligner = Aligner(
        crs=crs,
        processor=processor,
        config=aligner_config,
    )

    aligner.load_thematic_data(
        DictLoader(data_dict=data_dict, data_dict_properties=data_dict_properties)
    )
    if reference_loader == "wfs":
        aligner.load_reference_data(
            WFSReferenceLoader(
                url=params.reference_url,
                id_property=params.reference_id_property,
                typename=params.reference_typename,
                aligner=aligner,
                partition=reference_partition,
                limit=reference_limit,
            )
        )
    elif reference_loader == "ogc_feature_api":
        aligner.load_reference_data(
            OGCFeatureAPIReferenceLoader(
                url=_normalize_ogc_feature_api_url(params.reference_url),
                id_property=params.reference_id_property,
                collection=params.reference_collection,
                aligner=aligner,
                partition=reference_partition,
                limit=reference_limit,
            )
        )
    else:
        aligner.load_reference_data(
            GRBActualLoader(grb_type=grb_type, partition=1000, aligner=aligner)
        )

    aligner_result = aligner.evaluate(
        relevant_distances=relevant_distances,
        full_reference_strategy=full_strategy,
    )

    return aligner_result.get_results_as_geojson(
        result_type=result_type,
        aligner=aligner,
        add_metadata=True,
    )


def _result_type_from_mode(
    result_mode: Literal["all", "predictions"],
) -> AlignerResultType:
    if result_mode == "all":
        return AlignerResultType.PROCESSRESULTS
    return AlignerResultType.EVALUATED_PREDICTIONS


def _normalize_ogc_feature_api_url(url: Optional[str]) -> Optional[str]:
    if not url:
        return url
    normalized = url.rstrip("/")
    if normalized.endswith("/collections"):
        return normalized[: -len("/collections")]
    return normalized


def _normalize_request_properties(properties: Any) -> dict[str, Any]:
    if properties is None:
        return {}
    if hasattr(properties, "model_dump"):
        record = properties.model_dump(exclude_none=True)
    elif isinstance(properties, dict):
        record = {key: value for key, value in properties.items() if value is not None}
    else:
        return {}

    metadata = record.get("metadata")
    brdr_metadata = record.get("brdr_metadata")
    merged_metadata: dict[str, Any] = {}
    if isinstance(metadata, dict):
        merged_metadata.update(metadata)
    if isinstance(brdr_metadata, dict):
        merged_metadata.update(brdr_metadata)

    for key in ("actuation", "observations", "reference_version"):
        value = record.get(key)
        if value is not None:
            merged_metadata.setdefault(key, value)

    if merged_metadata:
        record["metadata"] = merged_metadata
        record["brdr_metadata"] = merged_metadata

    return record


@app.post("/aligner", response_model=ViewerResponse, response_model_exclude_none=True)
def aligner_endpoint(
    request_body: RequestBody,
    feature_id: Optional[str] = Query(
        default=None,
        description="Optional feature id when request contains multiple features",
    ),
    result_mode: Literal["all", "predictions"] = Query(
        default="all",
        description="all = full process steps, predictions = evaluated prediction output",
    ),
    include_metadata: bool = Query(
        default=False,
        description="Include BRDR metadata from the raw result in the viewer response",
    ),
):
    """
    Returns viewer-oriented BRDR alignment output for a set of features.

    - **featurecollection**: a geojson featurecollection with the features to align
    - **params**: optional: CRS, reference loader params, and alignment settings
    """
    try:
        process_results = calculate_alignment_geojson(
            request_body,
            result_type=_result_type_from_mode(result_mode),
            include_metadata=include_metadata,
        )
        return build_viewer_response(
            process_results,
            feature_id=feature_id,
            include_metadata=include_metadata,
        )
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except requests.exceptions.RequestException as exc:
        logger.exception("Upstream GRB service unavailable")
        raise HTTPException(status_code=503, detail="Upstream GRB service unavailable") from exc
    except Exception:
        logger.exception("Unexpected error while processing /aligner")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/aligner")
def aligner_help():
    return {
        "message": "Use POST /aligner for BRDR alignment.",
        "docs": "/docs",
        "example_query": "/aligner?feature_id=2&result_mode=all",
        "example_body": {
            "featurecollection": {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "id": "2",
                        "properties": {},
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
                        },
                    }
                ],
            },
            "params": {
                "crs": "EPSG:31370",
                "reference_loader": "grb",
                "grb_type": "GRB - ADP - administratief perceel",
                "max_relevant_distance": 10.0,
                "relevant_distance_step": 0.2,
            },
        },
    }


@app.get("/adpf/collections", response_model=AdpfCollectionsResponse)
def adpf_collections():
    try:
        response = requests.get(
            ADPF_COLLECTIONS_URL,
            params={"f": "application/json"},
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json()
    except requests.exceptions.RequestException as exc:
        logger.exception("Upstream Adpf collections service unavailable")
        raise HTTPException(
            status_code=503,
            detail="Upstream Adpf collections service unavailable",
        ) from exc

    raw_collections = payload.get("collections", []) if isinstance(payload, dict) else []
    parsed: list[AdpfCollectionSummary] = []
    for item in raw_collections:
        if not isinstance(item, dict):
            continue
        collection_id = item.get("id")
        if not isinstance(collection_id, str) or not collection_id:
            continue

        version_date = item.get("itemTypeDate") or item.get("updated") or item.get(
            "versionDate"
        )
        year = None
        for token in (collection_id, item.get("title")):
            if not isinstance(token, str):
                continue
            match = re.search(r"(20\d{2}|19\d{2})", token)
            if match:
                year = int(match.group(1))
                break

        parsed.append(
            AdpfCollectionSummary(
                id=collection_id,
                title=item.get("title") if isinstance(item.get("title"), str) else collection_id,
                version_date=str(version_date) if version_date is not None else None,
                year=year,
            )
        )

    parsed.sort(key=lambda item: ((item.year or 0), item.id))
    return {"collections": parsed}


@app.get("/")
def home():
    if viewer_static_dir:
        return FileResponse(_viewer_html_file("index.html"))
    return {
        "name": "brdr-aligner webservice",
        "links": [
            {"label": "grb viewer", "href": "/grb-viewer"},
            {"label": "brk viewer (wfs example)", "href": "/brk-viewer"},
            {"label": "geolifecycle manager", "href": "/geolifecyclemanager"},
            {"label": "grb compact alignment mfe", "href": "/alignment-mfe-simple.html"},
            {"label": "brk compact alignment mfe", "href": "/alignment-mfe-wfs-simple.html"},
            {"label": "aligner api", "href": "/aligner"},
            {"label": "adpf collections api", "href": "/adpf/collections"},
            {"label": "swagger docs", "href": "/docs"},
            {"label": "redoc", "href": "/redoc"},
            {"label": "openapi", "href": "/openapi.json"},
        ],
    }


if not viewer_static_dir:
    @app.get("/grb-viewer")
    @app.get("/grb-viewer.html")
    def viewer_unavailable():
        return {
            "detail": (
                "Viewer assets not found. Run the frontend dev server on "
                "http://127.0.0.1:5173 or build the viewer (`npm run build` in "
                "`brdr-viewer/brdr-viewer`) or use the Docker image that bundles the viewer."
            )
        }

    @app.get("/brk-viewer")
    @app.get("/brk-viewer.html")
    def viewer_brk_unavailable():
        return {
            "detail": (
                "Viewer assets not found. Run the frontend dev server on "
                "http://127.0.0.1:5173 or build the viewer (`npm run build` in "
                "`brdr-viewer/brdr-viewer`) or use the Docker image that bundles the viewer."
            )
        }

    @app.get("/geolifecyclemanager")
    @app.get("/geolifecyclemanager.html")
    def geolifecycle_unavailable():
        return {
            "detail": (
                "Viewer assets not found. Run the frontend dev server on "
                "http://127.0.0.1:5173 or build the viewer (`npm run build` in "
                "`brdr-viewer/brdr-viewer`) or use the Docker image that bundles the viewer."
            )
        }

    @app.get("/crs-viewer.html")
    def crs_viewer_unavailable():
        return {
            "detail": (
                "Viewer assets not found. Run the frontend dev server on "
                "http://127.0.0.1:5173 or build the viewer (`npm run build` in "
                "`brdr-viewer/brdr-viewer`) or use the Docker image that bundles the viewer."
            )
        }
else:
    @app.get("/grb-viewer")
    @app.get("/grb-viewer.html")
    def grb_viewer():
        return FileResponse(_viewer_html_file("grb-viewer.html"))

    @app.get("/brk-viewer")
    @app.get("/brk-viewer.html")
    def brk_viewer():
        return FileResponse(_viewer_html_file("brk-viewer.html"))

    @app.get("/geolifecyclemanager")
    @app.get("/geolifecyclemanager.html")
    def geolifecycle_manager():
        return FileResponse(_viewer_html_file("geolifecyclemanager.html"))

    @app.get("/crs-viewer.html")
    def crs_viewer():
        return FileResponse(_viewer_html_file("crs-viewer.html"))

    @app.get("/alignment-mfe.html")
    def alignment_mfe():
        return FileResponse(_viewer_html_file("alignment-mfe.html"))

    @app.get("/alignment-mfe-wfs.html")
    def alignment_mfe_wfs():
        return FileResponse(_viewer_html_file("alignment-mfe-wfs.html"))

    @app.get("/alignment-mfe-simple.html")
    def alignment_mfe_simple():
        return FileResponse(_viewer_html_file("alignment-mfe-simple.html"))

    @app.get("/alignment-mfe-wfs-simple.html")
    def alignment_mfe_wfs_simple():
        return FileResponse(_viewer_html_file("alignment-mfe-wfs-simple.html"))


@app.get("/viewer")
def viewer_redirect_root():
    return RedirectResponse(url="/grb-viewer", status_code=307)


@app.get("/viewer/{path:path}")
def viewer_redirect_path(path: str):
    return RedirectResponse(url="/grb-viewer", status_code=307)




def start_server():
    uvicorn.run(app, host=host, port=port)
    print("Webservice started at " + "http://" + host + ":" + str(port))


if __name__ == "__main__":
    start_server()

