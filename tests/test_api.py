import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import ValidationError

from grb_webservice import app, build_viewer_response
from grb_webservice_typings import RequestBody
from brdr.be.grb.enums import GRBType


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

    def test_build_viewer_response_from_actualiser_output(self):
        payload = make_actualiser_result()
        viewer = build_viewer_response(payload, feature_id="feat-1")

        self.assertEqual(sorted(viewer["series"].keys()), ["0.0", "0.1"])
        self.assertGreater(viewer["diffs"]["0.0"], 0.0)
        self.assertEqual(viewer["diffs"]["0.1"], 12.5)
        self.assertEqual(viewer["series"]["0.0"]["result"]["type"], "Polygon")
        self.assertEqual(viewer["series"]["0.1"]["result_diff_plus"]["type"], "Polygon")

    def test_viewer_endpoint_uses_actualiser_output_shape(self):
        payload = make_actualiser_result()
        request_body = make_request_body([make_feature("feat-1")])
        with patch("grb_webservice.calculate_alignment_geojson", return_value=payload):
            response = self.client.post("/actualiser/viewer", json=request_body)
        self.assertEqual(response.status_code, 200)
        parsed = response.json()
        self.assertIn("series", parsed)
        self.assertIn("diffs", parsed)
        self.assertEqual(parsed["diffs"]["0.1"], 12.5)

    def test_build_viewer_response_uses_geometry_area_when_diff_missing(self):
        payload = make_actualiser_result()
        for feature in payload["result"]["features"]:
            feature["properties"].pop("brdr_diff_area", None)
        viewer = build_viewer_response(payload, feature_id="feat-1")
        self.assertGreater(viewer["diffs"]["0.0"], 0.0)
        self.assertGreater(viewer["diffs"]["0.1"], 0.0)


if __name__ == "__main__":
    unittest.main()
