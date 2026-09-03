# GeoManager - Concept to Implementation (Ticket Draft)

## Summary
Build a `GeoManager` layer on top of BRDR to manage geometry objects over time, detect reference-layer changes, and automatically (or semi-automatically) apply BRDR-based updates with full auditability.

## Problem
Current alignment is often executed as a one-off process. In practice, reference layers evolve continuously (e.g. GRB/ADP/GBG/OSM), which causes managed geometries to drift over time and requires repeated manual correction.

## Goal
Shift from ad-hoc realignment to a continuous geometry lifecycle:
- detect reference changes
- identify impacted objects
- generate BRDR update candidates
- decide auto-accept vs review
- persist versioned outcomes with provenance

## Scope (MVP)
### In scope
- Impact detection pipeline for a selected dataset.
- BRDR `process/predict/evaluate` execution on impacted objects.
- Persisted proposed updates + metrics.
- Review output for doubtful cases.

### Out of scope (MVP)
- Full UI/workflow engine for approvals.
- Multi-tenant orchestration.
- Hard real-time streaming.

## Functional Requirements
1. Maintain object lifecycle with versioning (`valid_from`, `valid_to`, status).
2. Detect changed reference features in a configurable time window.
3. Find impacted managed objects by spatial relation (+ optional border-distance mode).
4. Run BRDR update flow on impacted objects.
5. Produce per-object decision status:
   - `auto_accept_candidate`
   - `to_review`
   - `hold/reject`
6. Store complete provenance (run id, config fingerprint, source versions, timestamps).

## Technical Design (high-level)
### Services/components
- **Orchestrator**: run management and status.
- **Change Detection**: reference delta retrieval + impacted object selection.
- **BRDR Engine Adapter**: executes `process/predict/evaluate`.
- **Decision Engine**: rule-based classification.
- **Storage Layer**: object versions, runs, metrics, audit logs.

### Core data entities
- `managed_object`
- `managed_object_version`
- `reference_snapshot`
- `update_run`
- `update_decision`

### End-to-end flow
1. Detect new reference snapshot/delta.
2. Compute impacted object IDs.
3. Execute BRDR for impacted objects.
4. Classify outcomes by rules.
5. Persist proposed/new versions and run metrics.
6. Export review queue + reports.

## Decision Rules (initial proposal)
- Auto-accept candidate if:
  - evaluation in allowed high-confidence statuses
  - prediction score >= threshold
  - area/length deltas within domain limits
- Review if:
  - uncertain `TO_CHECK_*` statuses
  - competing predictions
  - large or unusual geometry deltas
- Hold/reject if:
  - invalid geometry or policy constraints violated

## Expected Value
- Reduced manual GIS maintenance effort.
- Faster synchronization with evolving reference data.
- Better data quality over time.
- Full auditability and reproducibility.

## Risks
- False positives on complex geometries.
- Over-aggressive auto-accept rules.
- Semantic differences between reference sources.

## Mitigations
- Conservative defaults for decision rules.
- Domain-specific config profiles.
- Calibration loop with reviewed/labeled cases.

## Deliverables
1. MVP batch runner for impacted-object BRDR update generation.
2. Persisted proposed updates + run metrics.
3. Review export (GeoJSON/CSV/GPKG).
4. Technical documentation of lifecycle + decision logic.

## Acceptance Criteria
1. Given a reference delta, impacted objects are detected and processed end-to-end.
2. For each impacted object, a deterministic status (`auto_accept_candidate`, `to_review`, `hold/reject`) is produced.
3. All outputs include provenance and run metadata.
4. Re-running with identical input+config yields identical outcomes.
5. Metrics report includes counts and timing (processed, auto-candidate, review, failed).

## Suggested Phasing
- **Phase 1 (MVP)**: detection + BRDR candidate generation + persistence + review output.
- **Phase 2**: decision engine hardening + optional auto-accept path.
- **Phase 3**: API/scheduler/monitoring and broader dataset onboarding.
