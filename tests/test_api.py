import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from pydantic import ValidationError

from brdr_webservice import app, build_viewer_response, calculate_alignment_geojson
from brdr_webservice_typings import RequestBody
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
                        "brdr_diff_length": 5.0,
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
        self.assertIn("brdr-aligner frontend", response.text)

    def test_brdr_home_endpoint_smoke(self):
        response = self.client.get("/viewer", follow_redirects=False)
        self.assertEqual(response.status_code, 307)
        self.assertEqual(response.headers.get("location"), "/grb-viewer")

    def test_aligner_get_returns_help_instead_of_method_not_allowed(self):
        response = self.client.get("/aligner")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("Use POST /aligner", payload["message"])
        self.assertEqual(payload["docs"], "/docs")

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

    def test_request_body_rejects_wfs_without_required_fields(self):
        body = make_request_body([make_feature("1")])
        body["params"]["reference_loader"] = "wfs"
        with self.assertRaises(ValidationError):
            RequestBody.model_validate(body)

    def test_request_body_rejects_ogc_feature_api_without_required_fields(self):
        body = make_request_body([make_feature("1")])
        body["params"]["reference_loader"] = "ogc_feature_api"
        with self.assertRaises(ValidationError):
            RequestBody.model_validate(body)

    def test_request_body_accepts_wfs_reference_params(self):
        body = make_request_body([make_feature("1")])
        body["params"] = {
            "reference_loader": "wfs",
            "reference_url": "https://example.test/geoserver/wfs",
            "reference_id_property": "id",
            "reference_typename": "ns:layer",
        }
        parsed = RequestBody.model_validate(body)
        self.assertEqual(parsed.params.reference_loader, "wfs")

    def test_request_body_accepts_ogc_feature_api_reference_params(self):
        body = make_request_body([make_feature("1")])
        body["params"] = {
            "reference_loader": "ogc_feature_api",
            "reference_url": "https://example.test/ogc/features/v1/collections",
            "reference_id_property": "id",
            "reference_collection": "my_collection",
        }
        parsed = RequestBody.model_validate(body)
        self.assertEqual(parsed.params.reference_loader, "ogc_feature_api")

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
        self.assertEqual(viewer["diffs"]["0.0"], 0.0)
        self.assertEqual(viewer["diffs"]["0.1"], 12.5)
        self.assertEqual(viewer["series"]["0.0"]["result"]["type"], "Polygon")
        self.assertEqual(viewer["series"]["0.1"]["result_diff_plus"]["type"], "Polygon")

    def test_build_viewer_response_uses_length_for_line_geometries(self):
        payload = make_actualiser_result_lines()
        viewer = build_viewer_response(payload, feature_id="feat-1")
        self.assertEqual(viewer["diff_metric"], "length")
        self.assertEqual(viewer["diffs"]["0.0"], 5.0)

    def test_aligner_endpoint_uses_viewer_output_shape(self):
        payload = make_actualiser_result()
        request_body = make_request_body([make_feature("feat-1")])
        with patch("brdr_webservice.calculate_alignment_geojson", return_value=payload):
            response = self.client.post("/aligner", json=request_body)
        self.assertEqual(response.status_code, 200)
        parsed = response.json()
        self.assertIn("series", parsed)
        self.assertIn("diffs", parsed)
        self.assertIn("predictions", parsed)
        self.assertEqual(parsed["diffs"]["0.1"], 12.5)

    def test_build_viewer_response_uses_zero_area_when_diff_missing(self):
        payload = make_actualiser_result()
        for feature in payload["result"]["features"]:
            feature["properties"].pop("brdr_diff_area", None)
        viewer = build_viewer_response(payload, feature_id="feat-1")
        self.assertEqual(viewer["diffs"]["0.0"], 0.0)
        self.assertEqual(viewer["diffs"]["0.1"], 0.0)

    def test_build_viewer_response_prefers_brdr_internal_area_index(self):
        payload = make_actualiser_result()
        payload["result"]["features"][1]["properties"]["brdr_sym_diff_area_index"] = 3.25
        payload["result"]["features"][1]["properties"]["brdr_diff_area"] = 12.5
        viewer = build_viewer_response(payload, feature_id="feat-1")
        self.assertEqual(viewer["diffs"]["0.1"], 3.25)

    def test_aligner_result_mode_all_uses_processresults(self):
        payload = make_actualiser_result()
        request_body = make_request_body([make_feature("feat-1")])
        with patch("brdr_webservice.calculate_alignment_geojson", return_value=payload) as mocked:
            response = self.client.post("/aligner?result_mode=all", json=request_body)
        self.assertEqual(response.status_code, 200)
        mocked.assert_called_once()
        self.assertEqual(
            mocked.call_args.kwargs["result_type"],
            AlignerResultType.PROCESSRESULTS,
        )

    def test_aligner_result_mode_predictions(self):
        payload = make_actualiser_result()
        request_body = make_request_body([make_feature("feat-1")])
        with patch("brdr_webservice.calculate_alignment_geojson", return_value=payload) as mocked:
            response = self.client.post(
                "/aligner?result_mode=predictions",
                json=request_body,
            )
        self.assertEqual(response.status_code, 200)
        mocked.assert_called_once()
        self.assertEqual(
            mocked.call_args.kwargs["result_type"],
            AlignerResultType.EVALUATED_PREDICTIONS,
        )

    def test_calculate_alignment_uses_grb_loader_by_default(self):
        body = make_request_body([make_feature("feat-1")])
        request_model = RequestBody.model_validate(body)
        fake_aligner = MagicMock()
        fake_result = MagicMock()
        fake_result.get_results_as_geojson.return_value = {"status": "ok"}
        fake_aligner.evaluate.return_value = fake_result

        with (
            patch("brdr_webservice.Aligner", return_value=fake_aligner),
            patch("brdr_webservice.DictLoader", return_value=MagicMock()),
            patch("brdr_webservice.GRBActualLoader", return_value="grb_loader") as grb_loader_mock,
        ):
            result = calculate_alignment_geojson(request_model)

        self.assertEqual(result, {"status": "ok"})
        grb_loader_mock.assert_called_once()
        fake_aligner.load_reference_data.assert_called_once_with("grb_loader")

    def test_calculate_alignment_uses_wfs_loader(self):
        body = make_request_body([make_feature("feat-1")])
        body["params"] = {
            "reference_loader": "wfs",
            "reference_url": "https://example.test/geoserver/wfs",
            "reference_id_property": "id",
            "reference_typename": "ns:layer",
            "reference_partition": 777,
            "reference_limit": 8888,
        }
        request_model = RequestBody.model_validate(body)
        fake_aligner = MagicMock()
        fake_result = MagicMock()
        fake_result.get_results_as_geojson.return_value = {"status": "ok"}
        fake_aligner.evaluate.return_value = fake_result

        with (
            patch("brdr_webservice.Aligner", return_value=fake_aligner),
            patch("brdr_webservice.DictLoader", return_value=MagicMock()),
            patch("brdr_webservice.WFSReferenceLoader", return_value="wfs_loader") as wfs_loader_mock,
            patch("brdr_webservice.GRBActualLoader", return_value="grb_loader") as grb_loader_mock,
        ):
            result = calculate_alignment_geojson(request_model)

        self.assertEqual(result, {"status": "ok"})
        grb_loader_mock.assert_not_called()
        wfs_loader_mock.assert_called_once_with(
            url="https://example.test/geoserver/wfs",
            id_property="id",
            typename="ns:layer",
            aligner=fake_aligner,
            partition=777,
            limit=8888,
        )
        fake_aligner.load_reference_data.assert_called_once_with("wfs_loader")

    def test_calculate_alignment_uses_ogc_feature_api_loader(self):
        body = make_request_body([make_feature("feat-1")])
        body["params"] = {
            "reference_loader": "ogc_feature_api",
            "reference_url": "https://example.test/ogc/features/v1/collections",
            "reference_id_property": "id",
            "reference_collection": "my_collection",
            "reference_partition": 555,
            "reference_limit": 6666,
        }
        request_model = RequestBody.model_validate(body)
        fake_aligner = MagicMock()
        fake_result = MagicMock()
        fake_result.get_results_as_geojson.return_value = {"status": "ok"}
        fake_aligner.evaluate.return_value = fake_result

        with (
            patch("brdr_webservice.Aligner", return_value=fake_aligner),
            patch("brdr_webservice.DictLoader", return_value=MagicMock()),
            patch("brdr_webservice.OGCFeatureAPIReferenceLoader", return_value="ogc_loader") as ogc_loader_mock,
            patch("brdr_webservice.GRBActualLoader", return_value="grb_loader") as grb_loader_mock,
        ):
            result = calculate_alignment_geojson(request_model)

        self.assertEqual(result, {"status": "ok"})
        grb_loader_mock.assert_not_called()
        ogc_loader_mock.assert_called_once_with(
            url="https://example.test/ogc/features/v1/collections",
            id_property="id",
            collection="my_collection",
            aligner=fake_aligner,
            partition=555,
            limit=6666,
        )
        fake_aligner.load_reference_data.assert_called_once_with("ogc_loader")


if __name__ == "__main__":
    unittest.main()


