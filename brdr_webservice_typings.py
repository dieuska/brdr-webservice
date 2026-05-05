from typing import Optional, Dict, Any, Union, Self, Literal

from brdr.be.grb.enums import GRBType
from brdr.enums import FullReferenceStrategy, OpenDomainStrategy, SnapStrategy
from geojson_pydantic import (
    Feature,
    FeatureCollection,
    MultiLineString,
    MultiPoint,
    MultiPolygon,
    LineString,
    Point,
    Polygon,
)
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
    reference_loader: Optional[
        Literal["grb", "wfs", "ogc_feature_api"]
    ] = "grb"
    grb_type: Optional[GRBType] = GRBType.ADP
    reference_url: Optional[str] = None
    reference_id_property: Optional[str] = None
    reference_typename: Optional[str] = None
    reference_collection: Optional[str] = None
    reference_partition: Optional[int] = 1000
    reference_limit: Optional[int] = 10000
    full_reference_strategy: Optional[FullReferenceStrategy] = FullReferenceStrategy.PREFER_FULL_REFERENCE
    od_strategy: Optional[OpenDomainStrategy] = OpenDomainStrategy.SNAP_ALL_SIDE
    snap_strategy: Optional[SnapStrategy] = SnapStrategy.PREFER_VERTICES
    max_relevant_distance: Optional[float] = 10.0
    relevant_distance_step: Optional[float] = 0.2
    processor: Optional[
        Literal[
            "AlignerGeometryProcessor",
            "DieussaertGeometryProcessor",
            "NetworkGeometryProcessor",
            "SnapGeometryProcessor",
            "TopologyProcessor",
        ]
    ] = "AlignerGeometryProcessor"

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

    @field_validator("od_strategy", mode="before")
    @classmethod
    def normalize_od_strategy(cls, value):
        if value is None or isinstance(value, OpenDomainStrategy):
            return value
        if isinstance(value, str):
            stripped = value.strip()
            if stripped in OpenDomainStrategy.__members__:
                parsed = OpenDomainStrategy[stripped]
            else:
                try:
                    parsed = OpenDomainStrategy(stripped)
                except ValueError:
                    return value

            allowed_od = {
                OpenDomainStrategy.EXCLUDE,
                OpenDomainStrategy.AS_IS,
                OpenDomainStrategy.SNAP_INNER_SIDE,
                OpenDomainStrategy.SNAP_ALL_SIDE,
            }
            if parsed not in allowed_od:
                raise ValueError(
                    "od_strategy must be one of: EXCLUDE, AS_IS, SNAP_INNER_SIDE, SNAP_ALL_SIDE"
                )
            return parsed
        return value

    @field_validator("snap_strategy", mode="before")
    @classmethod
    def normalize_snap_strategy(cls, value):
        if value is None or isinstance(value, SnapStrategy):
            return value
        if isinstance(value, str):
            stripped = value.strip()
            if stripped in SnapStrategy.__members__:
                return SnapStrategy[stripped]
            lowered = stripped.lower()
            for enum_value in SnapStrategy:
                if enum_value.value == lowered:
                    return enum_value
        return value

    @field_validator("max_relevant_distance")
    @classmethod
    def validate_max_relevant_distance(cls, value):
        if value is None:
            return value
        if value <= 0:
            raise ValueError("max_relevant_distance must be > 0")
        if value > 25:
            raise ValueError("max_relevant_distance must be <= 25")
        return value

    @field_validator("relevant_distance_step")
    @classmethod
    def validate_relevant_distance_step(cls, value):
        if value is None:
            return value
        if value <= 0:
            raise ValueError("relevant_distance_step must be > 0")
        if value > 5:
            raise ValueError("relevant_distance_step must be <= 5")
        return value

    @field_validator("reference_partition")
    @classmethod
    def validate_reference_partition(cls, value):
        if value is None:
            return value
        if value <= 0:
            raise ValueError("reference_partition must be > 0")
        return value

    @field_validator("reference_limit")
    @classmethod
    def validate_reference_limit(cls, value):
        if value is None:
            return value
        if value <= 0:
            raise ValueError("reference_limit must be > 0")
        return value

    @model_validator(mode="after")
    def validate_reference_loader_params(self) -> Self:
        loader = self.reference_loader or "grb"
        if loader == "grb":
            return self

        if not self.reference_url:
            raise ValueError("reference_url is required when reference_loader is not 'grb'")
        if not self.reference_id_property:
            raise ValueError("reference_id_property is required when reference_loader is not 'grb'")

        if loader == "wfs" and not self.reference_typename:
            raise ValueError("reference_typename is required when reference_loader is 'wfs'")
        if loader == "ogc_feature_api" and not self.reference_collection:
            raise ValueError("reference_collection is required when reference_loader is 'ogc_feature_api'")

        return self

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "crs": "EPSG:31370",
                    "grb_type": "Administratieve percelen",
                    "full_reference_strategy": "prefer_full_reference",
                    "od_strategy": "SNAP_ALL_SIDE",
                    "snap_strategy": "PREFER_VERTICES",
                    "max_relevant_distance": 10.0,
                    "relevant_distance_step": 0.2,
                    "processor": "AlignerGeometryProcessor",
                }
            ]
        }
    }


GeometryModel = Union[
    Point,
    MultiPoint,
    LineString,
    MultiLineString,
    Polygon,
    MultiPolygon,
]


class RequestFeatureModel(Feature[GeometryModel, RequestProperties]):
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


class ResponseFeatureModel(Feature[GeometryModel, ResponseProperties]):
    pass


class ResponseBody(BaseModel):
    result: FeatureCollection[ResponseFeatureModel]
    result_diff: FeatureCollection[ResponseFeatureModel]
    result_diff_plus: FeatureCollection[ResponseFeatureModel]
    result_diff_min: FeatureCollection[ResponseFeatureModel]
    result_relevant_intersection: FeatureCollection[ResponseFeatureModel]
    result_relevant_diff: FeatureCollection[ResponseFeatureModel]


ViewerGeometry = GeometryModel


class ViewerStep(BaseModel):
    result: ViewerGeometry
    result_diff_min: ViewerGeometry
    result_diff_plus: ViewerGeometry


class ViewerResponse(BaseModel):
    series: Dict[str, ViewerStep]
    diffs: Dict[str, float]
    diff_metric: Literal["area", "length", "count"]
    predictions: Dict[str, bool]
    prediction_scores: Dict[str, float]
