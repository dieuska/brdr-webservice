"""
GeoManager MVP demo (standalone, no regressions in core brdr code)
===================================================================

What this script demonstrates:
1) Managed object lifecycle with version memory.
2) BRDR process/predict/evaluate pipeline per cycle.
3) Descriptor metadata + observations as decision input.
4) Automatic decisioning: auto-accept vs to-review.
5) Exportable run artifacts (JSON).

Run:
    .\\.venv\\Scripts\\python.exe geomanager\\mvp_lifecycle_demo.py
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from shapely import from_wkt
from shapely.geometry.base import BaseGeometry

from brdr.aligner import Aligner
from brdr.configs import AlignerConfig, ProcessorConfig
from brdr.constants import BASE_METADATA_FIELD_NAME, EVALUATION_FIELD_NAME, PREDICTION_SCORE
from brdr.enums import FullReferenceStrategy, OpenDomainStrategy
from brdr.loader import DictLoader
from brdr.processor import AlignerGeometryProcessor
from brdr.geometry_utils import geom_to_wkt


@dataclass
class ManagedVersion:
    cycle_id: str
    geometry: BaseGeometry
    candidate_geometry: BaseGeometry
    metadata: dict[str, Any] | None
    decision: str
    reason: str
    evaluation: str | None
    prediction_score: float | None
    auto_applied: bool


class GeoManagerMVP:
    def __init__(self):
        self.history: dict[str, list[ManagedVersion]] = {}
        self.relevant_distances = [0.0, 0.5, 1.0, 1.5, 2.0]
        self.run_log: list[dict[str, Any]] = []
        self.output_root = Path(__file__).resolve().parent

    @staticmethod
    def _extract_observation_signature(obs: dict[str, Any] | None) -> dict[str, Any]:
        if not isinstance(obs, dict):
            return {}
        out: dict[str, Any] = {
            "full": obs.get("full"),
            "measure_type": obs.get("measure_type"),
            "reference_od_area": None,
            "reference_feature_count": 0,
            "full_reference_feature_count": 0,
        }
        ref_od = obs.get("reference_od")
        if isinstance(ref_od, dict):
            out["reference_od_area"] = ref_od.get("area")
        ref_feats = obs.get("reference_features", {})
        if isinstance(ref_feats, dict):
            out["reference_feature_count"] = len(ref_feats)
            out["full_reference_feature_count"] = sum(
                1 for v in ref_feats.values() if isinstance(v, dict) and v.get("full")
            )
        return out

    @staticmethod
    def _observation_delta(
        base_sig: dict[str, Any], actual_sig: dict[str, Any]
    ) -> dict[str, Any]:
        if not base_sig or not actual_sig:
            return {
                "available": False,
                "reason": "missing_base_or_actual_observation_signature",
            }
        base_od = base_sig.get("reference_od_area")
        actual_od = actual_sig.get("reference_od_area")
        if base_od is not None and actual_od is not None:
            od_delta = float(actual_od) - float(base_od)
        else:
            od_delta = None
        return {
            "available": True,
            "full_changed": base_sig.get("full") != actual_sig.get("full"),
            "reference_feature_count_delta": (
                int(actual_sig.get("reference_feature_count", 0))
                - int(base_sig.get("reference_feature_count", 0))
            ),
            "full_reference_feature_count_delta": (
                int(actual_sig.get("full_reference_feature_count", 0))
                - int(base_sig.get("full_reference_feature_count", 0))
            ),
            "reference_od_area_delta": od_delta,
        }

    @staticmethod
    def _build_aligner(
        thematic_id: str,
        thematic_geom: BaseGeometry,
        reference_dict: dict[str, BaseGeometry],
        base_metadata: dict[str, Any] | None = None,
    ) -> Aligner:
        thematic_properties = {}
        if base_metadata is not None:
            thematic_properties[thematic_id] = {BASE_METADATA_FIELD_NAME: base_metadata}

        aligner_config = AlignerConfig(
            add_observations=True,
            log_metadata=True,
            profile_performance=True,
            max_workers=-1,
        )
        processor_config = ProcessorConfig(
            od_strategy=OpenDomainStrategy.SNAP_INNER_SIDE,
            threshold_overlap_percentage=50,
        )
        processor = AlignerGeometryProcessor(config=processor_config)
        aligner = Aligner(processor=processor, config=aligner_config)

        aligner.load_thematic_data(
            DictLoader(
                data_dict={thematic_id: thematic_geom},
                data_dict_properties=thematic_properties,
            )
        )
        aligner.load_reference_data(DictLoader(reference_dict, is_reference=True))
        return aligner

    def _select_best_candidate(
        self, aligner: Aligner, thematic_id: str
    ) -> tuple[float, dict[str, Any]]:
        evaluated = aligner.evaluate(
            relevant_distances=self.relevant_distances,
            thematic_ids=[thematic_id],
            full_reference_strategy=FullReferenceStrategy.PREFER_FULL_REFERENCE,
            max_predictions=-1,
            multi_to_best_prediction=True,
        ).get_results(aligner=aligner)

        candidates = evaluated.get(thematic_id, {})
        if not candidates:
            raise ValueError(f"No evaluated candidates for thematic_id={thematic_id}")

        # Prefer explicit predictor scores when available; otherwise fall back to
        # the candidate with the smallest open-domain residue.
        best_rd = None
        best_pr = None
        best_score = float("-inf")
        best_ref_od = float("inf")
        for rd, pr in candidates.items():
            props = pr.get("properties", {})
            score = float(props.get(PREDICTION_SCORE, -1))
            actual_observation = aligner.descriptor.get_actual_observation(
                aligner=aligner,
                process_result=pr,
                cache_key=(thematic_id, "candidate", rd),
            )
            ref_od_area = float("inf")
            if isinstance(actual_observation, dict):
                reference_od = actual_observation.get("reference_od")
                if isinstance(reference_od, dict):
                    ref_od_area = float(reference_od.get("area", 0.0))
                elif actual_observation.get("full"):
                    ref_od_area = 0.0

            if score > best_score or (
                score == best_score
                and (ref_od_area < best_ref_od or (ref_od_area == best_ref_od and rd < best_rd))
            ):
                best_score = score
                best_rd = rd
                best_pr = pr
                best_ref_od = ref_od_area
        if best_pr is None or best_rd is None:
            raise ValueError(f"Could not select candidate for thematic_id={thematic_id}")
        return best_rd, best_pr

    @staticmethod
    def _decision_rule(
        *,
        prediction_score: float | None,
        evaluation: str | None,
        ref_od_area: float,
        observation_delta: dict[str, Any],
    ) -> tuple[str, str]:
        # Conservative policy:
        # - auto-accept only for high-score + non-TO_CHECK + limited open-domain residue
        # - otherwise review
        if prediction_score is None or evaluation is None:
            return "to_review", "missing_score_or_evaluation"
        # Metadata-driven fallback for lifecycle continuity when predictor has no
        # stable candidate on synthetic/simple geometries.
        if "TO_CHECK_NO_PREDICTION" in evaluation and observation_delta.get("available"):
            od_delta = observation_delta.get("reference_od_area_delta")
            full_changed = observation_delta.get("full_changed")
            ref_cnt_delta = abs(
                int(observation_delta.get("reference_feature_count_delta", 0))
            )
            if (
                (od_delta is None or abs(float(od_delta)) <= 5.0)
                and not full_changed
                and ref_cnt_delta <= 1
            ):
                return "auto_accept_candidate", "metadata_fallback_low_observation_delta"
            return "to_review", "metadata_fallback_delta_too_high"
        if "TO_CHECK" in evaluation:
            return "to_review", "evaluation_to_check"
        if observation_delta.get("available"):
            if observation_delta.get("full_changed"):
                return "to_review", "observation_full_changed"
            od_delta = observation_delta.get("reference_od_area_delta")
            if od_delta is not None and od_delta > 5:
                return "to_review", "observation_od_delta_too_high"
        if prediction_score >= 80 and ref_od_area <= 5:
            return "auto_accept_candidate", "high_score_low_od"
        if prediction_score >= 60 and ref_od_area <= 1:
            return "auto_accept_candidate", "medium_score_minimal_od"
        return "to_review", "conservative_policy_triggered"

    def run_cycle(
        self,
        *,
        cycle_id: str,
        thematic_objects: dict[str, BaseGeometry],
        reference_dict: dict[str, BaseGeometry],
    ) -> dict[str, Any]:
        cycle_rows: list[dict[str, Any]] = []

        for thematic_id, source_geom in thematic_objects.items():
            previous_versions = self.history.get(thematic_id, [])
            base_version = previous_versions[-1] if previous_versions else None
            base_geom = base_version.geometry if base_version else source_geom
            base_metadata = base_version.metadata if base_version else None

            aligner = self._build_aligner(
                thematic_id=thematic_id,
                thematic_geom=base_geom,
                reference_dict=reference_dict,
                base_metadata=base_metadata,
            )
            rd, process_result = self._select_best_candidate(aligner, thematic_id)
            props = process_result.get("properties", {})
            metadata = process_result.get("metadata")

            # Use descriptor APIs explicitly: base observation from stored metadata,
            # actual observation from candidate geometry.
            base_observation = aligner.descriptor.get_base_observation(
                feature_properties={BASE_METADATA_FIELD_NAME: base_metadata}
                if base_metadata
                else {},
                metadata_field=BASE_METADATA_FIELD_NAME,
                cache_key=(thematic_id, "base"),
            )
            actual_observation = aligner.descriptor.get_actual_observation(
                aligner=aligner,
                process_result=process_result,
                cache_key=(thematic_id, cycle_id, rd),
            )
            base_signature = self._extract_observation_signature(base_observation)
            actual_signature = self._extract_observation_signature(actual_observation)
            observation_delta = self._observation_delta(base_signature, actual_signature)

            evaluation = None
            ev_raw = props.get(EVALUATION_FIELD_NAME)
            if ev_raw is not None:
                evaluation = getattr(ev_raw, "value", str(ev_raw))

            prediction_score = None
            ps_raw = props.get(PREDICTION_SCORE)
            if ps_raw is not None:
                prediction_score = float(ps_raw)

            ref_od_area = 0.0
            if isinstance(actual_observation, dict):
                od = actual_observation.get("reference_od")
                if isinstance(od, dict):
                    ref_od_area = float(od.get("area", 0.0))

            decision, reason = self._decision_rule(
                prediction_score=prediction_score,
                evaluation=evaluation,
                ref_od_area=ref_od_area,
                observation_delta=observation_delta,
            )

            auto_applied = decision == "auto_accept_candidate"
            managed_geometry = process_result["result"] if auto_applied else base_geom

            new_version = ManagedVersion(
                cycle_id=cycle_id,
                geometry=managed_geometry,
                candidate_geometry=process_result["result"],
                metadata=metadata,
                decision=decision,
                reason=reason,
                evaluation=evaluation,
                prediction_score=prediction_score,
                auto_applied=auto_applied,
            )
            self.history.setdefault(thematic_id, []).append(new_version)

            cycle_rows.append(
                {
                    "cycle_id": cycle_id,
                    "thematic_id": thematic_id,
                    "chosen_rd": rd,
                    "decision": decision,
                    "reason": reason,
                    "evaluation": evaluation,
                    "prediction_score": prediction_score,
                    "reference_od_area": ref_od_area,
                    "had_base_observation": base_observation is not None,
                    "has_actual_observation": actual_observation is not None,
                    "base_observation_signature": base_signature,
                    "actual_observation_signature": actual_signature,
                    "observation_delta": observation_delta,
                    "metadata_driven_management": {
                        "base_observation_loaded_from_metadata": (
                            base_observation is not None
                        ),
                        "actual_observation_computed_for_candidate": (
                            actual_observation is not None
                        ),
                        "decision_used_observation_delta": observation_delta.get(
                            "available", False
                        ),
                        "used_metadata_fallback_path": reason.startswith(
                            "metadata_fallback"
                        ),
                        "auto_applied_by_geomanager": auto_applied,
                        "managed_geometry_changed": geom_to_wkt(managed_geometry)
                        != geom_to_wkt(base_geom),
                    },
                    "geometry_base_wkt": geom_to_wkt(base_geom),
                    "geometry_candidate_wkt": geom_to_wkt(process_result["result"]),
                    "geometry_managed_wkt": geom_to_wkt(managed_geometry),
                    "geometry_result_diff_wkt": geom_to_wkt(
                        process_result.get("result_diff")
                    ),
                    "geometry_result_diff_plus_wkt": geom_to_wkt(
                        process_result.get("result_diff_plus")
                    ),
                    "geometry_result_diff_min_wkt": geom_to_wkt(
                        process_result.get("result_diff_min")
                    ),
                }
            )

        run_record = {
            "cycle_id": cycle_id,
            "executed_at": datetime.now().isoformat(),
            "results": cycle_rows,
        }
        self.run_log.append(run_record)
        return run_record

    def export_run_artifacts(self, output_dir: Path) -> None:
        output_dir.mkdir(parents=True, exist_ok=True)
        with (output_dir / "runs.json").open("w", encoding="utf-8") as f:
            json.dump(self.run_log, f, indent=2, ensure_ascii=False)

        compact_history: dict[str, list[dict[str, Any]]] = {}
        for obj_id, versions in self.history.items():
            compact_history[obj_id] = []
            for v in versions:
                compact_history[obj_id].append(
                    {
                        "cycle_id": v.cycle_id,
                        "decision": v.decision,
                        "reason": v.reason,
                        "evaluation": v.evaluation,
                        "prediction_score": v.prediction_score,
                        "has_metadata": v.metadata is not None,
                        "auto_applied": v.auto_applied,
                        "geometry_managed_wkt": geom_to_wkt(v.geometry),
                        "geometry_candidate_wkt": geom_to_wkt(v.candidate_geometry),
                    }
                )
        with (output_dir / "history_summary.json").open("w", encoding="utf-8") as f:
            json.dump(compact_history, f, indent=2, ensure_ascii=False)

        frontend_payload = {
            "generated_at": datetime.now().isoformat(),
            "cycles": self.run_log,
        }
        frontend_dir = self.output_root / "frontend" / "data"
        frontend_dir.mkdir(parents=True, exist_ok=True)
        with (frontend_dir / "mvp_runs.json").open("w", encoding="utf-8") as f:
            json.dump(frontend_payload, f, indent=2, ensure_ascii=False)


def _demo_data():
    thematic_objects = {
        "obj_1": from_wkt(
            "POLYGON ((172980 174380, 173140 174380, 173140 174520, 172980 174520, 172980 174380))"
        ),
        "obj_2": from_wkt(
            "POLYGON ((173220 174300, 173380 174300, 173390 174430, 173230 174438, 173220 174300))"
        ),
        "obj_3": from_wkt(
            "POLYGON ((173050 174180, 173200 174180, 173190 174270, 173042 174266, 173050 174180))"
        ),
    }

    reference_v1 = {
        "r1": from_wkt(
            "POLYGON ((172978 174378, 173142 174378, 173142 174522, 172978 174522, 172978 174378))"
        ),
        "r2": from_wkt(
            "POLYGON ((173218 174298, 173382 174298, 173392 174432, 173228 174440, 173218 174298))"
        ),
        "r3": from_wkt(
            "POLYGON ((173048 174178, 173202 174178, 173192 174272, 173040 174268, 173048 174178))"
        ),
    }

    # Simulate changed fiscal reference in the same EPSG:31370 area as the frontend.
    reference_v2 = {
        "r1": from_wkt(
            "POLYGON ((172992 174388, 173152 174390, 173148 174532, 172988 174528, 172992 174388))"
        ),
        "r2": from_wkt(
            "POLYGON ((173230 174308, 173392 174306, 173402 174442, 173236 174450, 173230 174308))"
        ),
        "r3": from_wkt(
            "POLYGON ((173060 174188, 173212 174190, 173202 174280, 173050 174278, 173060 174188))"
        ),
        "r4": from_wkt(
            "POLYGON ((173250 174442, 173290 174442, 173290 174460, 173250 174460, 173250 174442))"
        ),
    }
    return thematic_objects, reference_v1, reference_v2


def main():
    thematic_objects, reference_v1, reference_v2 = _demo_data()
    mgr = GeoManagerMVP()

    # Cycle 1: initial baseline from reference_v1
    run1 = mgr.run_cycle(
        cycle_id="cycle_1_baseline",
        thematic_objects=thematic_objects,
        reference_dict=reference_v1,
    )
    # Cycle 2: simulate lifecycle update after reference change
    run2 = mgr.run_cycle(
        cycle_id="cycle_2_reference_update",
        thematic_objects=thematic_objects,
        reference_dict=reference_v2,
    )

    out_dir = mgr.output_root / "mvp_output"
    mgr.export_run_artifacts(out_dir)

    print("GeoManager MVP completed.")
    print(f"Output folder: {out_dir}")
    print("Cycle 1 decisions:", run1["results"])
    print("Cycle 2 decisions:", run2["results"])


if __name__ == "__main__":
    main()
