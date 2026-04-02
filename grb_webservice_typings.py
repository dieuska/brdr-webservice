from typing import Optional, Dict, Any, Union, Self

from brdr.be.grb.enums import GRBType
from brdr.enums import FullReferenceStrategy
from geojson_pydantic import Feature, FeatureCollection, MultiPolygon, Polygon
from pydantic import BaseModel, model_validator, field_validator



class ReferenceSource(BaseModel):
    source: str
    version_date: str

    model_config = {
        "json_schema_extra": {
            "examples": [{"source": "Adpf", "version_date": "2022-01-01"}]
        }
    }


class ReferenceFeature(BaseModel):
    full: bool
    area: float
    percentage: Optional[float]
    version_date: str

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "full": True,
                    "area": 1344.81,
                    "percentage": 100,
                    "version_date": "2019-07-25",
                }
            ]
        }
    }


class Metadata(BaseModel):
    alignment_date: str
    brdr_version: str
    reference_source: ReferenceSource
    full: bool
    area: float
    reference_features: Optional[Dict[Any, ReferenceFeature]]
    reference_od: Optional[Dict[Any, float]]
    last_version_date: Optional[str]

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "alignment_date": "2025-02-13",
                    "brdr_version": "0.8.1",
                    "reference_source": {
                        "source": "Adpf",
                        "version_date": "2022-01-01",
                    },
                    "full": True,
                    "area": 1344.81,
                    "reference_features": {
                        "24126B0031/00N005": {
                            "full": True,
                            "area": 1344.81,
                            "percentage": 100,
                            "version_date": "2019-07-25",
                        }
                    },
                    "reference_od": None,
                    "last_version_date": "2019-07-25",
                }
            ]
        }
    }


class RequestProperties(BaseModel):
    # id: Any
    metadata: Optional[Metadata] = None

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    # "id": "300",
                    "metadata": {
                        "alignment_date": "2025-02-13",
                        "brdr_version": "0.8.1",
                        "reference_source": {
                            "source": "Adpf",
                            "version_date": "2022-01-01",
                        },
                        "full": True,
                        "area": 1344.81,
                        "reference_features": {
                            "24126B0031/00N005": {
                                "full": True,
                                "area": 1344.81,
                                "percentage": 100,
                                "version_date": "2019-07-25",
                            }
                        },
                        "reference_od": None,
                        "last_version_date": "2019-07-25",
                    }
                }
            ]
        }
    }


class RequestParams(BaseModel):
    crs: Optional[str] = "EPSG:31370"
    grb_type: Optional[GRBType] = GRBType.ADP
    full_reference_strategy: Optional[FullReferenceStrategy] = FullReferenceStrategy.PREFER_FULL_REFERENCE

    @field_validator("grb_type", mode="before")
    @classmethod
    def normalize_grb_type(cls, value):
        if value is None or isinstance(value, GRBType):
            return value
        if isinstance(value, str):
            stripped = value.strip()
            if stripped in GRBType.__members__:
                return GRBType[stripped]

            lowered = stripped.lower()
            legacy_to_enum = {
                "grb - adp - administratief perceel": GRBType.ADP,
                "grb - gbg - gebouwen": GRBType.GBG,
                "grb - knw - kunstwerken": GRBType.KNW,
            }
            if lowered in legacy_to_enum:
                return legacy_to_enum[lowered]
        return value

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "crs": "EPSG:31370",
                    "grb_type": "Administratieve percelen",
                    "full_reference_strategy": "prefer_full_reference",
                }
            ]
        }
    }


class RequestFeatureModel(Feature[Union[Polygon, MultiPolygon], RequestProperties]):
    pass


class RequestBody(BaseModel):
    featurecollection: FeatureCollection[RequestFeatureModel]
    params: Optional[RequestParams] = None

    @model_validator(mode="after")
    def check_unique_ids(self) -> Self:
        ids = [feature.id for feature in self.featurecollection.features]
        if any(feature_id is None for feature_id in ids):
            raise ValueError("All features must have an ID")
        if len(ids) != len(set(ids)):
            raise ValueError("All feature IDs must be unique")
        return self

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "featurecollection": {
                        "type": "FeatureCollection",
                        "features": [
                            {
                                "type": "Feature",
                                "id": "2",
                                "properties": {},
                                "geometry": {
                                    "type": "MultiPolygon",
                                    "coordinates": [
                                        [
                                            [
                                                [174111.5042, 179153.924300000013318],
                                                [174110.0614, 179154.109399999986636],
                                                [174068.867, 179159.3947],
                                                [
                                                    174068.86610000001383,
                                                    179159.426199999987148,
                                                ],
                                                [174068.8626, 179159.557299999985844],
                                                [174073.7483, 179188.9357],
                                                [174120.4387, 179180.3235],
                                                [
                                                    174116.133299999986775,
                                                    179157.20250000001397,
                                                ],
                                                [174111.549009999987902, 179153.956007],
                                                [174111.5042, 179153.924300000013318],
                                            ]
                                        ]
                                    ],
                                },
                            }
                        ],
                    },
                    "params": {
                        "crs": "EPSG:31370",
                        "grb_type": "Administratieve percelen",
                        "full_reference_strategy": "prefer_full_reference",
                    },
                }
            ]
        }
    }


class ResponseProperties(BaseModel):
    brdr_metadata: str
    brdr_evaluation: str
    brdr_full_base: Optional[bool]
    brdr_full_actual: bool
    brdr_od_alike: Optional[bool]
    brdr_equal_reference_features: Optional[bool]
    brdr_diff_percentage: Optional[float]
    brdr_diff_area: Optional[float]
    brdr_prediction_count: int
    brdr_prediction_score: float
    brdr_id: Optional[Any]
    brdr_nr_calculations: int
    brdr_relevant_distance: float
    brdr_remark: Optional[list]
    brdr_area: float
    brdr_perimeter: float
    brdr_shape_index: float


class ResponseFeatureModel(Feature[Union[Polygon, MultiPolygon], ResponseProperties]):
    pass


class ResponseBody(BaseModel):
    result: FeatureCollection[ResponseFeatureModel]
    result_diff: FeatureCollection[ResponseFeatureModel]
    result_diff_plus: FeatureCollection[ResponseFeatureModel]
    result_diff_min: FeatureCollection[ResponseFeatureModel]
    result_relevant_intersection: FeatureCollection[ResponseFeatureModel]
    result_relevant_diff: FeatureCollection[ResponseFeatureModel]


ViewerGeometry = Union[Polygon, MultiPolygon]


class ViewerStep(BaseModel):
    result: ViewerGeometry
    result_diff_min: ViewerGeometry
    result_diff_plus: ViewerGeometry


class ViewerResponse(BaseModel):
    series: Dict[str, ViewerStep]
    diffs: Dict[str, float]
    predictions: Dict[str, bool]
    prediction_scores: Dict[str, float]
