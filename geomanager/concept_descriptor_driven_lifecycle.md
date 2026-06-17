# GeoManager Extension: Lifecycle Driven by BRDR Descriptor, Metadata and Observations

## Why this extension
The current GeoManager concept already fits BRDR well, but BRDR provides more lifecycle-ready building blocks than a standard geometry update engine:
- geometric diffs
- prediction candidates and scores
- evaluation statuses
- **descriptor-generated observations and metadata**

The descriptor layer is the key enabler for deterministic lifecycle decisions over time.

---

## 1. What BRDR already provides for lifecycle behavior

## 1.1 Process results with explicit change dimensions
For each object and relevant distance, BRDR produces:
- `result`
- `result_diff`
- `result_diff_plus`
- `result_diff_min`
- `properties` (remarks, metrics)

This is already a version-ready output model (candidate geometry + explainability).

## 1.2 Prediction stage (candidate generation)
`predict()` enriches candidates with:
- `brdr_prediction_score`
- `prediction_count`
- stability indicators

This gives an initial ranking of candidate updates for lifecycle selection.

## 1.3 Evaluation stage (candidate selection semantics)
`evaluate()` adds semantic statuses such as:
- unique prediction
- full-reference preference outcomes
- no-prediction / to-check classes

These statuses are exactly what a lifecycle decision engine needs for automation vs review.

## 1.4 Descriptor stage (critical for governance)
`AlignerDescriptor.describe(...)` can add:
- `observations` (via `compare_to_reference`)
- `metadata.actuation` (who/what/how/when of the operation)
- `metadata.observations` (SOSA-like observation records)

This is not just logging: this is **decision-grade provenance**.

## 1.5 Reversible metadata encoding/decoding
BRDR supports round-trip behavior:
- `get_metadata_observations_from_process_result(...)`
- `reverse_metadata_observations_to_brdr_observation(...)`
- `descriptor.get_base_observation(...)`

That means GeoManager can compare:
- base observation (stored from previous approved version)
- actual observation (new candidate)

without recomputing everything from scratch every time.

---

## 2. Core design update for GeoManager

GeoManager should treat descriptor output as a **first-class lifecycle artifact**.

## 2.1 Object version model should include
Per `managed_object_version`:
- geometry
- BRDR properties (prediction/evaluation/diff metrics)
- descriptor metadata (`actuation`, `observations`)
- normalized observation snapshot (base + actual)
- decision payload (rule hits, reason codes)

## 2.2 Lifecycle state transitions
Recommended states:
- `baseline_approved`
- `candidate_generated`
- `candidate_auto_accepted`
- `candidate_to_review`
- `candidate_rejected`
- `superseded`

Transitions should be driven by:
- evaluation class
- prediction score
- observation delta
- change magnitude thresholds

## 2.3 Observation-aware decisioning (new)
Instead of only geometry delta thresholds, use descriptor observation deltas:
- overlap percentage shifts per reference feature
- open-domain metric changes
- DE-9IM relation shifts for key references

This makes decisions more robust than pure area/length heuristics.

---

## 3. Decision framework using BRDR descriptor outputs

## 3.1 Decision inputs
For each candidate:
- `brdr_evaluation`
- `brdr_prediction_score`
- diff metrics (`symdiff`, plus/min)
- `observations` (actual)
- stored base metadata/observation from approved version

## 3.2 Rule groups

### A. High-confidence auto-accept
- evaluation in allow-list (unique/high-confidence classes)
- score >= threshold
- change metrics within domain envelope
- observation delta consistent (no anomalous relation jumps)

### B. Forced review
- `TO_CHECK_*` classes
- multiple competing candidates
- conflicting observation evidence (e.g. large OD increase while score is high)

### C. Hold/reject
- invalid geometry
- policy constraints violated
- unstable prediction signal

## 3.3 Reason codes (store explicitly)
Examples:
- `EVAL_UNIQUE_HIGH_SCORE`
- `EVAL_MULTI_REVIEW_REQUIRED`
- `OBS_OD_INCREASE_ALERT`
- `DIFF_EXCEEDS_DOMAIN_LIMIT`
- `INVALID_GEOMETRY`

This is essential for trust and audit.

---

## 4. How to use descriptor metadata as lifecycle memory

## 4.1 At approval time
When a candidate is approved, persist:
- geometry version
- `metadata` payload from descriptor
- normalized observation snapshot

This becomes the new baseline for next cycle.

## 4.2 At next cycle
For each object:
1. decode previous baseline observation from stored metadata (`get_base_observation` path)
2. compute candidate actual observation (`get_actual_observation` path)
3. evaluate candidate against baseline observation + prediction/evaluation metadata
4. decide auto-accept/review/reject

This creates an explicit temporal memory loop.

---

## 5. Proposed GeoManager architecture add-ons

## 5.1 Descriptor Adapter module
A thin module that:
- extracts normalized lifecycle fields from BRDR process results
- stores metadata + observation snapshots in stable schema
- computes observation deltas for decision rules

## 5.2 Observation Delta Engine
Computes time-aware deltas, e.g.:
- full/not-full transitions
- overlap percentage differences per linked reference id
- OD metric increase/decrease
- relation changes (DE-9IM)

## 5.3 Decision Policy Registry
Configurable policy profiles per domain:
- thresholds
- allow-lists for evaluations
- observation anomaly conditions

---

## 6. Implementation roadmap update

### Step 1: Enable descriptor outputs in all GeoManager BRDR runs
- ensure `aligner.add_observations=True`
- ensure `aligner.log_metadata=True`

### Step 2: Extend persisted version schema
- add fields for metadata and normalized observations
- add decision reason codes

### Step 3: Implement observation-aware rules
- start with conservative rules (review-first)
- only later enable auto-accept in narrow high-confidence window

### Step 4: Add lifecycle analytics
Track over time:
- % auto-accept vs review
- observation drift patterns
- false-positive/false-negative review outcomes

---

## 7. Practical benefit of this extension
With this extension, GeoManager evolves from:
- "geometry update orchestrator"

to:
- "time-aware geospatial decision system" backed by BRDR-native provenance and explainability.

This is exactly the mode needed for organizations that require controlled automation, traceability, and reproducible policy decisions.
