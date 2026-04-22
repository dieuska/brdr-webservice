import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import ValidationError

from grb_webservice import app, build_viewer_response
from grb_webservice_typings import RequestBody
from brdr.be.grb.enums import GRBType
from brdr.enums import AlignerResultType, OpenDomainStrategy


def make_feature(feature_id):
    feature = {
        "type": "Feature",
        "properties": {},
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [
                    [174111.0, 179153.0],
                    [174112.0, 179153.0],
                    [174112.0, 179154.0],
                    [174111.0, 179154.0],
                    [174111.0, 179153.0],
                ]
            ],
        },
    }
    if feature_id is not None:
        feature["id"] = feature_id
    return feature


def make_point_feature(feature_id):
    feature = {
        "type": "Feature",
        "properties": {},
        "geometry": {
            "type": "Point",
            "coordinates": [174111.0, 179153.0],
        },
    }
    if feature_id is not None:
        feature["id"] = feature_id
    return feature


def make_line_feature(feature_id):
    feature = {
        "type": "Feature",
        "properties": {},
        "geometry": {
            "type": "LineString",
            "coordinates": [
                [174111.0, 179153.0],
                [174112.0, 179154.0],
            ],
        },
    }
    if feature_id is not None:
        feature["id"] = feature_id
    return feature


def make_request_body(features):
    return {
        "featurecollection": {
            "type": "FeatureCollection",
            "features": features,
        },
        "params": {},
    }


def make_polygon(offset: float):
    return {
        "type": "Polygon",
        "coordinates": [
            [
                [offset + 0.0, offset + 0.0],
                [offset + 1.0, offset + 0.0],
                [offset + 1.0, offset + 1.0],
                [offset + 0.0, offset + 1.0],
                [offset + 0.0, offset + 0.0],
            ]
        ],
    }


def make_linestring(offset: float):
    return {
        "type": "LineString",
        "coordinates": [
            [offset + 0.0, offset + 0.0],
            [offset + 3.0, offset + 4.0],
        ],
    }


def make_actualiser_result():
    return {
        "result": {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "id": "feat-1",
                    "geometry": make_polygon(0),
                    "properties": {
                        "brdr_relevant_distance": 0.0,
                        "brdr_diff_area": 0.0,
                        "brdr_id": "feat-1",
                    },
                },
                {
                    "type": "Feature",
                    "id": "feat-1",
                    "geometry": make_polygon(1),
                    "properties": {
                        "brdr_relevant_distance": 0.1,
                        "brdr_diff_area": 12.5,
                        "brdr_id": "feat-1",
                    },
                },
            ],
        },
        "result_diff_min": {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "id": "feat-1",
                    "geometry": make_polygon(10),
                    "properties": {
                        "brdr_relevant_distance": 0.0,
                        "brdr_id": "feat-1",
                    },
                }
            ],
        },
        "result_diff_plus": {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "id": "feat-1",
                    "geometry": make_polygon(20),
                    "properties": {
                        "brdr_relevant_distance": 0.1,
                        "brdr_id": "feat-1",
                    },
                }
            ],
        },
    }


def make_actualiser_result_lines():
    return {
        "result": {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "id": "feat-1",
                    "geometry": make_linestring(0),
                    "properties": {
                        "brdr_relevant_distance": 0.0,
                        "brdr_diff_area": 0.0,
                        "brdr_id": "feat-1",
                    },
                }
            ],
        },
        "result_diff_min": {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "id": "feat-1",
                    "geometry": make_linestring(10),
                    "properties": {
                        "brdr_relevant_distance": 0.0,
                        "brdr_id": "feat-1",
                    },
                }
            ],
        },
        "result_diff_plus": {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "id": "feat-1",
                    "geometry": make_linestring(20),
                    "properties": {
                        "brdr_relevant_distance": 0.0,
                        "brdr_id": "feat-1",
                    },
                }
            ],
        },
    }


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_request_body_rejects_duplicate_feature_ids(self):
        body = make_request_body([make_feature("1"), make_feature("1")])
        with self.assertRaises(ValidationError):
            RequestBody.model_validate(body)

    def test_request_body_rejects_missing_feature_id(self):
        body = make_request_body([make_feature(None)])
        with self.assertRaises(ValidationError):
            RequestBody.model_validate(body)

    def test_home_endpoint_smoke(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("/actualiser", response.json())

    def test_request_body_accepts_legacy_grb_type_label(self):
        body = make_request_body([make_feature("1")])
        body["params"]["grb_type"] = "GRB - ADP - administratief perceel"
        parsed = RequestBody.model_validate(body)
        self.assertEqual(parsed.params.grb_type, GRBType.ADP)

    def test_request_body_accepts_grb_type_enum_name(self):
        body = make_request_body([make_feature("1")])
        body["params"]["grb_type"] = "GBG"
        parsed = RequestBody.model_validate(body)
        self.assertEqual(parsed.params.grb_type, GRBType.GBG)

    def test_request_body_accepts_open_domain_strategy(self):
        body = make_request_body([make_feature("1")])
        body["params"]["od_strategy"] = "SNAP_ALL_SIDE"
        parsed = RequestBody.model_validate(body)
        self.assertEqual(parsed.params.od_strategy, OpenDomainStrategy.SNAP_ALL_SIDE)

    def test_request_body_accepts_snap_strategy(self):
        body = make_request_body([make_feature("1")])
        body["params"]["snap_strategy"] = "ONLY_VERTICES"
        parsed = RequestBody.model_validate(body)
        self.assertEqual(parsed.params.snap_strategy.value, "only_vertices")

    def test_request_body_accepts_max_relevant_distance(self):
        body = make_request_body([make_feature("1")])
        body["params"]["max_relevant_distance"] = 8.5
        parsed = RequestBody.model_validate(body)
        self.assertEqual(parsed.params.max_relevant_distance, 8.5)

    def test_request_body_rejects_max_relevant_distance_above_25(self):
        body = make_request_body([make_feature("1")])
        body["params"]["max_relevant_distance"] = 25.1
        with self.assertRaises(ValidationError):
            RequestBody.model_validate(body)

    def test_request_body_accepts_processor(self):
        body = make_request_body([make_feature("1")])
        body["params"]["processor"] = "AlignerGeometryProcessor"
        parsed = RequestBody.model_validate(body)
        self.assertEqual(parsed.params.processor, "AlignerGeometryProcessor")

    def test_request_body_accepts_point_geometry(self):
        body = make_request_body([make_point_feature("1")])
        parsed = RequestBody.model_validate(body)
        self.assertEqual(parsed.featurecollection.features[0].geometry.type, "Point")

    def test_request_body_accepts_linestring_geometry(self):
        body = make_request_body([make_line_feature("1")])
        parsed = RequestBody.model_validate(body)
        self.assertEqual(
            parsed.featurecollection.features[0].geometry.type, "LineString"
        )

    def test_build_viewer_response_from_actualiser_output(self):
        payload = make_actualiser_result()
        viewer = build_viewer_response(payload, feature_id="feat-1")

        self.assertEqual(sorted(viewer["series"].keys()), ["0.0", "0.1"])
        self.assertEqual(viewer["diff_metric"], "area")
        self.assertGreater(viewer["diffs"]["0.0"], 0.0)
        self.assertEqual(viewer["diffs"]["0.1"], 12.5)
        self.assertEqual(viewer["series"]["0.0"]["result"]["type"], "Polygon")
        self.assertEqual(viewer["series"]["0.1"]["result_diff_plus"]["type"], "Polygon")

    def test_build_viewer_response_uses_length_for_line_geometries(self):
        payload = make_actualiser_result_lines()
        viewer = build_viewer_response(payload, feature_id="feat-1")
        self.assertEqual(viewer["diff_metric"], "length")
        self.assertGreater(viewer["diffs"]["0.0"], 0.0)

    def test_viewer_endpoint_uses_actualiser_output_shape(self):
        payload = make_actualiser_result()
        request_body = make_request_body([make_feature("feat-1")])
        with patch("grb_webservice.calculate_alignment_geojson", return_value=payload):
            response = self.client.post("/actualiser/viewer", json=request_body)
        self.assertEqual(response.status_code, 200)
        parsed = response.json()
        self.assertIn("series", parsed)
        self.assertIn("diffs", parsed)
        self.assertIn("predictions", parsed)
        self.assertEqual(parsed["diffs"]["0.1"], 12.5)

    def test_build_viewer_response_uses_geometry_area_when_diff_missing(self):
        payload = make_actualiser_result()
        for feature in payload["result"]["features"]:
            feature["properties"].pop("brdr_diff_area", None)
        viewer = build_viewer_response(payload, feature_id="feat-1")
        self.assertGreater(viewer["diffs"]["0.0"], 0.0)
        self.assertGreater(viewer["diffs"]["0.1"], 0.0)

    def test_actualiser_result_mode_all_uses_processresults(self):
        payload = make_actualiser_result()
        request_body = make_request_body([make_feature("feat-1")])
        with patch("grb_webservice.calculate_alignment_geojson", return_value=payload) as mocked:
            response = self.client.post("/actualiser?result_mode=all", json=request_body)
        self.assertEqual(response.status_code, 200)
        mocked.assert_called_once()
        self.assertEqual(
            mocked.call_args.kwargs["result_type"],
            AlignerResultType.PROCESSRESULTS,
        )

    def test_actualiser_viewer_result_mode_predictions(self):
        payload = make_actualiser_result()
        request_body = make_request_body([make_feature("feat-1")])
        with patch("grb_webservice.calculate_alignment_geojson", return_value=payload) as mocked:
            response = self.client.post(
                "/actualiser/viewer?result_mode=predictions",
                json=request_body,
            )
        self.assertEqual(response.status_code, 200)
        mocked.assert_called_once()
        self.assertEqual(
            mocked.call_args.kwargs["result_type"],
            AlignerResultType.EVALUATED_PREDICTIONS,
        )


if __name__ == "__main__":
    unittest.main()
