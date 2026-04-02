import numpy as np
import uvicorn
import logging
import requests
import os
from typing import Any, Optional, Literal
from brdr.be.grb.enums import GRBType
from brdr.be.grb.loader import GRBActualLoader
from brdr.configs import ProcessorConfig, AlignerConfig
from brdr.enums import OpenDomainStrategy, FullReferenceStrategy, AlignerResultType
from brdr.processor import AlignerGeometryProcessor
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from shapely.geometry import shape

from brdr.aligner import Aligner

from brdr.loader import DictLoader
from grb_webservice_typings import ResponseBody, RequestBody, ViewerResponse

port = 80
host = "0.0.0.0"

app = FastAPI()
logger = logging.getLogger(__name__)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
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
    app.mount("/viewer", StaticFiles(directory=viewer_static_dir, html=True), name="viewer")
    legacy_assets_dir = os.path.join(viewer_static_dir, "assets")
    if os.path.isdir(legacy_assets_dir):
        app.mount("/assets", StaticFiles(directory=legacy_assets_dir), name="viewer-assets")


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
        if geom_type == "MultiPolygon":
            base_point = coordinates[0][0][0]
        else:
            base_point = coordinates[0][0]
    except (IndexError, TypeError):
        pass

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


def _is_prediction_step(evaluation: Any, prediction_score: Any) -> bool:
    if isinstance(evaluation, str) and "prediction" in evaluation.lower():
        return True
    if prediction_score is not None:
        try:
            return float(prediction_score) > 0
        except (TypeError, ValueError):
            return False
    return False


def build_viewer_response(
    actualiser_result: dict[str, Any], feature_id: Optional[str] = None
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
    series = {}
    diffs = {}
    predictions = {}
    prediction_scores = {}

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

        diff_value = result_by_distance[distance_key].get("diff_area")
        numeric_diff_value: Optional[float] = None
        if diff_value is not None:
            try:
                numeric_diff_value = abs(float(diff_value))
            except (TypeError, ValueError):
                numeric_diff_value = None

        if numeric_diff_value is not None and numeric_diff_value > 0:
            diffs[distance_key] = numeric_diff_value
        else:
            diffs[distance_key] = (
                _safe_geometry_area(diff_min_geometry)
                + _safe_geometry_area(diff_plus_geometry)
            )
        predictions[distance_key] = _is_prediction_step(
            result_by_distance[distance_key].get("evaluation"),
            result_by_distance[distance_key].get("prediction_score"),
        )
        try:
            prediction_scores[distance_key] = float(
                result_by_distance[distance_key].get("prediction_score") or 0.0
            )
        except (TypeError, ValueError):
            prediction_scores[distance_key] = 0.0

    if not series:
        raise ValueError(f"No geometries found for feature_id '{selected_feature_id}'")

    return {
        "series": series,
        "diffs": diffs,
        "predictions": predictions,
        "prediction_scores": prediction_scores,
    }


def calculate_alignment_geojson(
    request_body: RequestBody,
    result_type: AlignerResultType = AlignerResultType.EVALUATED_PREDICTIONS,
) -> dict[str, Any]:
    params = request_body.params

    relevant_distances = [
        round(k, 2) for k in np.arange(0, 610, 10, dtype=int) / 100
    ]
    crs = params.crs if params and params.crs else "EPSG:31370"
    threshold_overlap_percentage = 50
    od_strategy = OpenDomainStrategy.SNAP_ALL_SIDE
    area_limit = 100000
    grb_type = params.grb_type if params and params.grb_type else GRBType.ADP
    full_strategy = (
        params.full_reference_strategy
        if params and params.full_reference_strategy
        else FullReferenceStrategy.PREFER_FULL_REFERENCE
    )

    data_dict = {}
    for f in request_body.featurecollection.features:
        data_dict[f.id] = shape(f.geometry.model_dump())

    processor_config = ProcessorConfig()
    processor_config.od_strategy = od_strategy
    processor_config.threshold_overlap_percentage = threshold_overlap_percentage
    processor_config.area_limit = area_limit

    processor = AlignerGeometryProcessor(config=processor_config)
    aligner_config = AlignerConfig()
    aligner = Aligner(
        crs=crs,
        processor=processor,
        config=aligner_config,
    )

    aligner.load_thematic_data(DictLoader(data_dict=data_dict))
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


@app.post("/actualiser")
def actualiser(
    request_body: RequestBody,
    result_mode: Literal["all", "predictions"] = Query(
        default="predictions",
        description="all = full process steps, predictions = evaluated prediction output",
    ),
):
    """
    Returns GRB-actualised predictions (+ score) for a set of features

    - **featurecollection**: a geojson featurecollection with the features to align
    - **params**: optional: CRS, full_reference_strategy
    """
    try:
        return calculate_alignment_geojson(
            request_body,
            result_type=_result_type_from_mode(result_mode),
        )
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except requests.exceptions.RequestException as exc:
        logger.exception("Upstream GRB service unavailable")
        raise HTTPException(status_code=503, detail="Upstream GRB service unavailable") from exc
    except Exception:
        logger.exception("Unexpected error while processing /actualiser")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/actualiser/viewer", response_model=ViewerResponse)
def actualiser_viewer(
    request_body: RequestBody,
    feature_id: Optional[str] = Query(
        default=None,
        description="Optional feature id when request contains multiple features",
    ),
    result_mode: Literal["all", "predictions"] = Query(
        default="all",
        description="all = full process steps, predictions = evaluated prediction output",
    ),
):
    try:
        process_results = calculate_alignment_geojson(
            request_body,
            result_type=_result_type_from_mode(result_mode),
        )
        return build_viewer_response(process_results, feature_id=feature_id)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/")
def home():
    return (
        "Welcome to GRB-actualiser webservice!.You can actualise on '/actualiser'."
        "Docs can be found at '/docs'. Viewer (if bundled) is available at '/viewer'."
    )


if not viewer_static_dir:
    @app.get("/viewer")
    def viewer_unavailable():
        return {
            "detail": (
                "Viewer assets not found. Run the frontend dev server on "
                "http://127.0.0.1:5173 or build the viewer (`npm run build` in "
                "`brdr-viewer/brdr-viewer`) or use the Docker image that bundles the viewer."
            )
        }


def start_server():
    uvicorn.run(app, host=host, port=port)
    print("Webservice started at " + "http://" + host + ":" + str(port))


if __name__ == "__main__":
    start_server()
