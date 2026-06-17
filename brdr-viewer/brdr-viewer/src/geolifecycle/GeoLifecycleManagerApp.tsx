import { startTransition, useEffect, useMemo, useState } from "react";
import {
  fetchAdpfCollections,
  fetchBrdrResponse,
  getDefaultRequestBody,
} from "../api/brdrApi";
import { GeoLifecycleMap } from "./GeoLifecycleMap";
import type { AdpfCollectionSummary, BrdrRequestBody, BrdrResponse, Geometry } from "../types/brdr";
import "./GeoLifecycleManager.css";

const ADPF_REFERENCE_URL =
  "https://geo.api.vlaanderen.be/Adpf/ogc/features/v1";
const ADPF_REFERENCE_ID_PROPERTY = "CAPAKEY";

type Decision = "auto_accept_candidate" | "to_review";

interface ObservationSignature {
  full: boolean | null;
  referenceFeatureCount: number;
  fullReferenceFeatureCount: number;
  referenceOdArea: number | null;
}

interface ObservationDelta {
  available: boolean;
  fullChanged?: boolean;
  referenceFeatureCountDelta?: number;
  fullReferenceFeatureCountDelta?: number;
  referenceOdAreaDelta?: number | null;
}

interface LifecycleStage {
  collection: AdpfCollectionSummary;
  response: BrdrResponse;
  sourceGeometry: Geometry;
  selectedStepKey: string;
  candidateGeometry: Geometry;
  managedGeometry: Geometry;
  metadata: unknown;
  evaluation: string | null;
  predictionScore: number;
  diffValue: number;
  decision: Decision;
  reason: string;
  autoApplied: boolean;
  observation: ObservationSignature;
  observationDelta: ObservationDelta;
}

interface CandidateItem {
  stepKey: string;
  evaluation: string | null;
  predictionScore: number;
  diffValue: number;
  isPrediction: boolean;
  metadata: unknown;
}

function formatCollectionLabel(collection: AdpfCollectionSummary) {
  if (collection.year) {
    return `${collection.year} (${collection.id})`;
  }
  return collection.title || collection.id;
}

function geometryClone<T>(value: T): T {
  return structuredClone(value);
}

function buildLifecycleRequest(
  geometry: Geometry,
  collectionId: string,
  metadata?: unknown
): BrdrRequestBody {
  const requestBody = structuredClone(getDefaultRequestBody());
  requestBody.featurecollection.features = [
    {
      type: "Feature",
      id: "lifecycle-1",
      properties: metadata ? ({ metadata } as Record<string, unknown>) : {},
      geometry,
    },
  ];
  requestBody.params = {
    crs: "EPSG:31370",
    reference_loader: "ogc_feature_api",
    grb_type: "GRB - ADP - administratief perceel",
    reference_url: ADPF_REFERENCE_URL,
    reference_id_property: ADPF_REFERENCE_ID_PROPERTY,
    reference_collection: collectionId,
    reference_partition: 1000,
    reference_limit: 10000,
    full_reference_strategy: "prefer_full_reference",
    od_strategy: "SNAP_ALL_SIDE",
    snap_strategy: "PREFER_VERTICES",
    max_relevant_distance: 8,
    relevant_distance_step: 0.2,
    processor: "AlignerGeometryProcessor",
  };
  return requestBody;
}

function getStepKeys(response: BrdrResponse) {
  return Object.keys(response.series)
    .map(Number)
    .sort((a, b) => a - b)
    .map((value) => value.toFixed(1));
}

function getCandidateItems(response: BrdrResponse): CandidateItem[] {
  const items = getStepKeys(response).map((stepKey) => ({
    stepKey,
    evaluation: response.evaluations?.[stepKey] ?? null,
    predictionScore: response.prediction_scores?.[stepKey] ?? 0,
    diffValue: response.diffs?.[stepKey] ?? 0,
    isPrediction: response.predictions?.[stepKey] ?? false,
    metadata: response.metadata?.[stepKey],
  }));

  return items.sort((a, b) => {
    if (a.isPrediction !== b.isPrediction) {
      return a.isPrediction ? -1 : 1;
    }
    if (a.predictionScore !== b.predictionScore) {
      return b.predictionScore - a.predictionScore;
    }
    return a.diffValue - b.diffValue;
  });
}

function extractReferenceOdArea(referenceOd: unknown): number | null {
  if (!referenceOd || typeof referenceOd !== "object") {
    return null;
  }

  const record = referenceOd as Record<string, unknown>;
  if (typeof record.area === "number") {
    return record.area;
  }

  const numericValues = Object.values(record).filter(
    (value): value is number => typeof value === "number"
  );
  if (numericValues.length === 0) {
    return null;
  }
  return numericValues.reduce((sum, value) => sum + value, 0);
}

function extractObservationSignature(metadata: unknown): ObservationSignature {
  if (!metadata || typeof metadata !== "object") {
    return {
      full: null,
      referenceFeatureCount: 0,
      fullReferenceFeatureCount: 0,
      referenceOdArea: null,
    };
  }

  const record = metadata as Record<string, unknown>;
  const referenceFeatures =
    record.reference_features && typeof record.reference_features === "object"
      ? (record.reference_features as Record<string, unknown>)
      : {};
  const referenceFeatureEntries = Object.values(referenceFeatures).filter(
    (value): value is Record<string, unknown> =>
      Boolean(value) && typeof value === "object"
  );

  return {
    full: typeof record.full === "boolean" ? record.full : null,
    referenceFeatureCount: referenceFeatureEntries.length,
    fullReferenceFeatureCount: referenceFeatureEntries.filter(
      (entry) => entry.full === true
    ).length,
    referenceOdArea: extractReferenceOdArea(record.reference_od),
  };
}

function computeObservationDelta(
  previous: ObservationSignature | null,
  current: ObservationSignature
): ObservationDelta {
  if (!previous) {
    return { available: false };
  }

  return {
    available: true,
    fullChanged:
      previous.full !== null && current.full !== null
        ? previous.full !== current.full
        : false,
    referenceFeatureCountDelta:
      current.referenceFeatureCount - previous.referenceFeatureCount,
    fullReferenceFeatureCountDelta:
      current.fullReferenceFeatureCount - previous.fullReferenceFeatureCount,
    referenceOdAreaDelta:
      previous.referenceOdArea === null || current.referenceOdArea === null
        ? null
        : current.referenceOdArea - previous.referenceOdArea,
  };
}

function decideStage(
  evaluation: string | null,
  predictionScore: number,
  observation: ObservationSignature,
  observationDelta: ObservationDelta,
  hasPreviousMetadata: boolean
): { decision: Decision; reason: string } {
  const evaluationUpper = evaluation?.toUpperCase() ?? "";
  const refOdArea = observation.referenceOdArea ?? 0;

  if (!hasPreviousMetadata) {
    if (evaluationUpper.includes("TO_CHECK")) {
      return { decision: "to_review", reason: "baseline_to_check" };
    }
    return { decision: "auto_accept_candidate", reason: "baseline_candidate" };
  }

  if (
    evaluationUpper.includes("TO_CHECK_NO_PREDICTION") &&
    observationDelta.available
  ) {
    const odDelta = observationDelta.referenceOdAreaDelta;
    const fullChanged = observationDelta.fullChanged;
    const refCountDelta = Math.abs(observationDelta.referenceFeatureCountDelta ?? 0);

    if (
      (odDelta === null || odDelta === undefined || Math.abs(odDelta) <= 5) &&
      !fullChanged &&
      refCountDelta <= 1
    ) {
      return {
        decision: "auto_accept_candidate",
        reason: "metadata_fallback_low_observation_delta",
      };
    }
    return { decision: "to_review", reason: "metadata_fallback_delta_too_high" };
  }

  if (evaluationUpper.includes("TO_CHECK")) {
    return { decision: "to_review", reason: "evaluation_to_check" };
  }

  if (observationDelta.available) {
    if (observationDelta.fullChanged) {
      return { decision: "to_review", reason: "observation_full_changed" };
    }
    if (
      observationDelta.referenceOdAreaDelta !== null &&
      observationDelta.referenceOdAreaDelta !== undefined &&
      observationDelta.referenceOdAreaDelta > 5
    ) {
      return { decision: "to_review", reason: "observation_od_delta_too_high" };
    }
  }

  if (predictionScore >= 80 && refOdArea <= 5) {
    return { decision: "auto_accept_candidate", reason: "high_score_low_od" };
  }
  if (predictionScore >= 60 && refOdArea <= 1) {
    return { decision: "auto_accept_candidate", reason: "medium_score_minimal_od" };
  }
  return { decision: "to_review", reason: "conservative_policy_triggered" };
}

function buildStageFromResponse(
  collection: AdpfCollectionSummary,
  response: BrdrResponse,
  sourceGeometry: Geometry,
  previousMetadata: unknown,
  selectedStepKey?: string,
  forceAutoApply?: boolean
): LifecycleStage {
  const candidates = getCandidateItems(response);
  if (candidates.length === 0) {
    throw new Error("Geen BRDR-kandidaten ontvangen.");
  }

  const chosen =
    (selectedStepKey
      ? candidates.find((item) => item.stepKey === selectedStepKey)
      : undefined) ?? candidates[0];

  const candidateGeometry = response.series[chosen.stepKey]?.result;
  if (!candidateGeometry) {
    throw new Error(`Geen geometrie gevonden voor stap ${chosen.stepKey}.`);
  }

  const metadata = response.metadata?.[chosen.stepKey];
  const observation = extractObservationSignature(metadata);
  const previousObservation = previousMetadata
    ? extractObservationSignature(previousMetadata)
    : null;
  const observationDelta = computeObservationDelta(previousObservation, observation);
  const decision = decideStage(
    chosen.evaluation,
    chosen.predictionScore,
    observation,
    observationDelta,
    previousMetadata !== undefined && previousMetadata !== null
  );
  const autoApplied = forceAutoApply ?? decision.decision === "auto_accept_candidate";

  return {
    collection,
    response,
    sourceGeometry: geometryClone(sourceGeometry),
    selectedStepKey: chosen.stepKey,
    candidateGeometry: geometryClone(candidateGeometry),
    managedGeometry: geometryClone(autoApplied ? candidateGeometry : sourceGeometry),
    metadata,
    evaluation: chosen.evaluation,
    predictionScore: chosen.predictionScore,
    diffValue: chosen.diffValue,
    decision: decision.decision,
    reason: decision.reason,
    autoApplied,
    observation,
    observationDelta,
  };
}

function summarizeMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") {
    return { actuation: "geen", observationCount: 0, referenceVersion: "-" };
  }

  const record = metadata as Record<string, unknown>;
  const actuation =
    typeof record.actuation === "string"
      ? record.actuation
      : typeof record.alignment_date === "string"
        ? `alignment ${record.alignment_date}`
        : "beschikbaar";
  const observations = Array.isArray(record.observations) ? record.observations.length : 0;
  const referenceVersion =
    record.reference_source &&
    typeof record.reference_source === "object" &&
    typeof (record.reference_source as Record<string, unknown>).version_date === "string"
      ? String((record.reference_source as Record<string, unknown>).version_date)
      : typeof record.last_version_date === "string"
        ? record.last_version_date
        : "-";

  return {
    actuation,
    observationCount: observations,
    referenceVersion,
  };
}

function formatDiff(value: number, metric: BrdrResponse["diff_metric"]) {
  const safeMetric = metric ?? "area";
  if (safeMetric === "count") {
    return `${value.toFixed(0)} pt`;
  }
  if (safeMetric === "length") {
    return `${value.toFixed(2)} m`;
  }
  return `${value.toFixed(2)} m2`;
}

export default function GeoLifecycleManagerApp() {
  const [collections, setCollections] = useState<AdpfCollectionSummary[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);
  const [baselineCollectionId, setBaselineCollectionId] = useState<string>("");
  const [drawRequestToken, setDrawRequestToken] = useState(1);
  const [draftGeometry, setDraftGeometry] = useState<Geometry | null>(null);
  const [baselineProposal, setBaselineProposal] = useState<LifecycleStage | null>(null);
  const [baselineSelectedStepKey, setBaselineSelectedStepKey] = useState("");
  const [acceptedStages, setAcceptedStages] = useState<LifecycleStage[]>([]);
  const [pendingStage, setPendingStage] = useState<LifecycleStage | null>(null);
  const [pendingSelectedStepKey, setPendingSelectedStepKey] = useState("");
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [sliderStageIndex, setSliderStageIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState(
    "Teken een polygon en kies daarna een historische AdpF-versie als baseline."
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCollections() {
      setCollectionsLoading(true);
      setCollectionsError(null);
      try {
        const nextCollections = await fetchAdpfCollections();
        if (cancelled) return;
        setCollections(nextCollections);
        setBaselineCollectionId(nextCollections[0]?.id ?? "");
      } catch (err) {
        if (cancelled) return;
        setCollectionsError(err instanceof Error ? err.message : "Kon AdpF collecties niet laden.");
      } finally {
        if (!cancelled) {
          setCollectionsLoading(false);
        }
      }
    }

    void loadCollections();
    return () => {
      cancelled = true;
    };
  }, []);

  const baselineIndex = useMemo(
    () => collections.findIndex((item) => item.id === baselineCollectionId),
    [baselineCollectionId, collections]
  );

  const lifecycleCollections = useMemo(
    () => (baselineIndex >= 0 ? collections.slice(baselineIndex) : []),
    [baselineIndex, collections]
  );

  const sliderMax = Math.max(
    lifecycleCollections.length > 0 ? lifecycleCollections.length - 1 : 0,
    acceptedStages.length > 0 ? acceptedStages.length - 1 : 0
  );

  const activeStage =
    pendingStage && activeStageIndex === acceptedStages.length
      ? buildStageFromResponse(
          pendingStage.collection,
          pendingStage.response,
          pendingStage.sourceGeometry,
          acceptedStages[acceptedStages.length - 1]?.metadata,
          pendingSelectedStepKey || pendingStage.selectedStepKey,
          false
        )
      : acceptedStages[activeStageIndex] ?? null;

  const metadataSummary = summarizeMetadata(activeStage?.metadata);

  async function executeAlignment(
    geometry: Geometry,
    collection: AdpfCollectionSummary,
    previousMetadata?: unknown
  ) {
    const requestBody = buildLifecycleRequest(geometry, collection.id, previousMetadata);
    return fetchBrdrResponse(requestBody, { includeMetadata: true });
  }

  function resetLifecycleForNewGeometry(nextGeometry: Geometry) {
    startTransition(() => {
      setDraftGeometry(nextGeometry);
      setBaselineProposal(null);
      setBaselineSelectedStepKey("");
      setAcceptedStages([]);
      setPendingStage(null);
      setPendingSelectedStepKey("");
      setActiveStageIndex(0);
      setSliderStageIndex(0);
      setError(null);
      setStatusText("Nieuwe geometrie klaar. Kies een baselineversie en start de eerste alignering.");
    });
  }

  async function handleRunBaseline() {
    if (!draftGeometry || !baselineCollectionId) {
      setError("Teken eerst een polygon en kies een baselineversie.");
      return;
    }
    const collection = collections.find((item) => item.id === baselineCollectionId);
    if (!collection) {
      setError("Baselineversie niet gevonden.");
      return;
    }

    setLoading(true);
    setError(null);
    setStatusText(`Baseline alignering gestart voor ${formatCollectionLabel(collection)}.`);
    try {
      const response = await executeAlignment(draftGeometry, collection);
      const stage = buildStageFromResponse(collection, response, draftGeometry, null);
      if (stage.autoApplied) {
        startTransition(() => {
          setAcceptedStages([stage]);
          setBaselineProposal(null);
          setActiveStageIndex(0);
          setSliderStageIndex(0);
          setStatusText(`Baseline vastgelegd op ${formatCollectionLabel(collection)}.`);
        });
      } else {
        startTransition(() => {
          setBaselineProposal(stage);
          setBaselineSelectedStepKey(stage.selectedStepKey);
          setStatusText(
            `Baseline op ${formatCollectionLabel(collection)} vraagt bevestiging. Kies een kandidaat.`
          );
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Baseline alignering mislukte.");
    } finally {
      setLoading(false);
    }
  }

  function handleApproveBaseline() {
    if (!baselineProposal) return;
    const approved = buildStageFromResponse(
      baselineProposal.collection,
      baselineProposal.response,
      baselineProposal.sourceGeometry,
      null,
      baselineSelectedStepKey || baselineProposal.selectedStepKey,
      true
    );
    startTransition(() => {
      setAcceptedStages([approved]);
      setBaselineProposal(null);
      setBaselineSelectedStepKey("");
      setActiveStageIndex(0);
      setSliderStageIndex(0);
      setStatusText(`Baseline handmatig vastgelegd op ${formatCollectionLabel(approved.collection)}.`);
    });
  }

  async function advanceLifecycleTo(targetIndex: number) {
    if (acceptedStages.length === 0) {
      return;
    }

    let workingStages = [...acceptedStages];
    let currentManagedGeometry = geometryClone(
      workingStages[workingStages.length - 1].managedGeometry
    );
    let currentMetadata = geometryClone(workingStages[workingStages.length - 1].metadata);

    setLoading(true);
    setError(null);
    try {
      for (let stageIndex = workingStages.length; stageIndex <= targetIndex; stageIndex += 1) {
        const collection = lifecycleCollections[stageIndex];
        if (!collection) {
          break;
        }
        setStatusText(`Lifecycle alignering gestart voor ${formatCollectionLabel(collection)}.`);
        const response = await executeAlignment(currentManagedGeometry, collection, currentMetadata);
        const nextStage = buildStageFromResponse(
          collection,
          response,
          currentManagedGeometry,
          currentMetadata
        );

        if (!nextStage.autoApplied) {
          startTransition(() => {
            setPendingStage(nextStage);
            setPendingSelectedStepKey(nextStage.selectedStepKey);
            setActiveStageIndex(stageIndex);
            setSliderStageIndex(stageIndex);
            setStatusText(
              `Review nodig voor ${formatCollectionLabel(collection)}. Kies een voorstel om de lifecycle verder te zetten.`
            );
          });
          return;
        }

        workingStages = [...workingStages, nextStage];
        currentManagedGeometry = geometryClone(nextStage.managedGeometry);
        currentMetadata = geometryClone(nextStage.metadata);
      }

      startTransition(() => {
        setAcceptedStages(workingStages);
        setPendingStage(null);
        setPendingSelectedStepKey("");
        setActiveStageIndex(Math.min(targetIndex, workingStages.length - 1));
        setSliderStageIndex(Math.min(targetIndex, workingStages.length - 1));
        setStatusText("Lifecycle automatisch bijgewerkt tot de gekozen versie.");
      });
    } catch (err) {
      setSliderStageIndex(activeStageIndex);
      setError(err instanceof Error ? err.message : "Lifecycle update mislukte.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSliderChange(nextIndex: number) {
    if (acceptedStages.length === 0) {
      return;
    }

    setSliderStageIndex(nextIndex);

    if (pendingStage) {
      const pendingIndex = acceptedStages.length;
      if (nextIndex > pendingIndex) {
        setStatusText("Los eerst de huidige review op voordat je verder gaat naar nieuwere versies.");
        setActiveStageIndex(pendingIndex);
        setSliderStageIndex(pendingIndex);
        return;
      }
      setActiveStageIndex(nextIndex);
      return;
    }

    if (nextIndex < acceptedStages.length) {
      setActiveStageIndex(nextIndex);
      setStatusText(`Toon lifecycle-stadium ${nextIndex + 1}.`);
      return;
    }

    await advanceLifecycleTo(nextIndex);
  }

  function handleApprovePending() {
    if (!pendingStage) return;
    const previousMetadata = acceptedStages[acceptedStages.length - 1]?.metadata;
    const approved = buildStageFromResponse(
      pendingStage.collection,
      pendingStage.response,
      pendingStage.sourceGeometry,
      previousMetadata,
      pendingSelectedStepKey || pendingStage.selectedStepKey,
      true
    );

    startTransition(() => {
      const nextStages = [...acceptedStages, approved];
      setAcceptedStages(nextStages);
      setPendingStage(null);
      setPendingSelectedStepKey("");
      setActiveStageIndex(nextStages.length - 1);
      setSliderStageIndex(nextStages.length - 1);
      setStatusText(`Review bevestigd voor ${formatCollectionLabel(approved.collection)}.`);
    });
  }

  const visibleCandidateItems = useMemo(() => {
    if (baselineProposal) {
      return getCandidateItems(baselineProposal.response);
    }
    if (pendingStage) {
      return getCandidateItems(pendingStage.response);
    }
    return [];
  }, [baselineProposal, pendingStage]);

  const currentCollectionId =
    activeStage?.collection.id ??
    baselineProposal?.collection.id ??
    baselineCollectionId ??
    null;

  const managedGeometryForMap =
    pendingStage && activeStageIndex === acceptedStages.length
      ? acceptedStages[acceptedStages.length - 1]?.managedGeometry ?? null
      : activeStage?.managedGeometry ?? null;
  const proposalGeometryForMap =
    baselineProposal
      ? buildStageFromResponse(
          baselineProposal.collection,
          baselineProposal.response,
          baselineProposal.sourceGeometry,
          null,
          baselineSelectedStepKey || baselineProposal.selectedStepKey,
          false
        ).candidateGeometry
      : pendingStage && activeStageIndex === acceptedStages.length
        ? activeStage?.candidateGeometry ?? null
        : null;

  return (
    <div className="lifecycle-app">
      <section className="lifecycle-hero">
        <div>
          <p className="lifecycle-eyebrow">GeoLifecycleManager</p>
          <h1>Metadata-gedreven lifecycle van polygonen over historische AdpF-versies</h1>
          <p className="lifecycle-intro">
            Teken een polygon, leg een baseline vast op een oude AdpF-collectie, en schuif daarna
            door nieuwere referentieversies. De viewer gebruikt BRDR metadata als lifecyclegeheugen
            en stopt alleen voor manuele keuze wanneer `evaluate()` onvoldoende zekerheid geeft.
          </p>
        </div>
        <div className="lifecycle-status-panel">
          <div className="status-kpi">
            <span className="status-kpi-label">Baseline</span>
            <strong>{baselineCollectionId ? formatCollectionLabel(collections.find((item) => item.id === baselineCollectionId) ?? { id: baselineCollectionId, title: baselineCollectionId }) : "-"}</strong>
          </div>
          <div className="status-kpi">
            <span className="status-kpi-label">Goedgekeurde stadia</span>
            <strong>{acceptedStages.length}</strong>
          </div>
          <div className="status-kpi">
            <span className="status-kpi-label">Review nodig</span>
            <strong>{pendingStage || baselineProposal ? "ja" : "nee"}</strong>
          </div>
        </div>
      </section>

      <div className="lifecycle-layout">
        <div className="lifecycle-map-panel">
          <GeoLifecycleMap
            referenceCollectionId={currentCollectionId}
            originalGeometry={draftGeometry}
            managedGeometry={managedGeometryForMap}
            proposalGeometry={proposalGeometryForMap}
            draftGeometry={draftGeometry}
            loading={loading}
            drawRequestToken={drawRequestToken}
            onDrawn={resetLifecycleForNewGeometry}
          />
        </div>

        <aside className="lifecycle-sidebar">
          <section className="lifecycle-card">
            <div className="lifecycle-card-header">
              <h2>1. Start met een polygon</h2>
              <button
                type="button"
                className="lifecycle-button lifecycle-button-secondary"
                onClick={() => setDrawRequestToken((value) => value + 1)}
              >
                Teken opnieuw
              </button>
            </div>
            <p className="lifecycle-help">
              Werk in EPSG:31370. De getekende polygon blijft zichtbaar als blauwe brongeometrie.
            </p>
            <div className="lifecycle-chip-row">
              <span className={`lifecycle-chip${draftGeometry ? " is-active" : ""}`}>
                {draftGeometry ? "polygon klaar" : "nog geen polygon"}
              </span>
              <span className="lifecycle-chip">{currentCollectionId || "geen collectie"}</span>
            </div>
          </section>

          <section className="lifecycle-card">
            <div className="lifecycle-card-header">
              <h2>2. Kies een baselineversie</h2>
            </div>
            <label className="lifecycle-field">
              Historische AdpF collectie
              <select
                value={baselineCollectionId}
                onChange={(event) => setBaselineCollectionId(event.target.value)}
                disabled={collectionsLoading || loading}
              >
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {formatCollectionLabel(collection)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="lifecycle-button"
              onClick={() => void handleRunBaseline()}
              disabled={!draftGeometry || !baselineCollectionId || loading || collectionsLoading}
            >
              Aligneren op baseline
            </button>
            {collectionsError && <p className="lifecycle-error">{collectionsError}</p>}
          </section>

          {acceptedStages.length > 0 && (
            <section className="lifecycle-card">
              <div className="lifecycle-card-header">
                <h2>3. Schuif door de lifecycle</h2>
                <span className="lifecycle-stage-label">
                  stadium {activeStageIndex + 1} / {lifecycleCollections.length}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={sliderMax}
                value={Math.min(sliderStageIndex, sliderMax)}
                onChange={(event) => void handleSliderChange(Number(event.target.value))}
                className="lifecycle-slider"
              />
              <div className="lifecycle-slider-labels">
                <span>{formatCollectionLabel(lifecycleCollections[0])}</span>
                <span>
                  {formatCollectionLabel(
                    lifecycleCollections[Math.min(sliderMax, lifecycleCollections.length - 1)]
                  )}
                </span>
              </div>
              <p className="lifecycle-help">
                Nieuwe versies worden sequentieel berekend vanaf de laatst goedgekeurde geometrie.
              </p>
            </section>
          )}

          {(baselineProposal || pendingStage) && (
            <section className="lifecycle-card lifecycle-card-review">
              <div className="lifecycle-card-header">
                <h2>Review nodig</h2>
                <span className="lifecycle-stage-label">
                  {(baselineProposal ?? pendingStage)?.collection.id}
                </span>
              </div>
              <p className="lifecycle-help">
                BRDR gaf hier geen voldoende eenduidige automatische beslissing. Kies expliciet een kandidaat.
              </p>
              <div className="lifecycle-candidate-list">
                {visibleCandidateItems.map((item) => {
                  const selected =
                    baselineProposal
                      ? (baselineSelectedStepKey || baselineProposal.selectedStepKey) === item.stepKey
                      : (pendingSelectedStepKey || pendingStage?.selectedStepKey) === item.stepKey;
                  return (
                    <button
                      key={item.stepKey}
                      type="button"
                      className={`lifecycle-candidate${selected ? " is-active" : ""}`}
                      onClick={() =>
                        baselineProposal
                          ? setBaselineSelectedStepKey(item.stepKey)
                          : setPendingSelectedStepKey(item.stepKey)
                      }
                    >
                      <strong>{item.stepKey} m</strong>
                      <span>status: {item.evaluation ?? "onbekend"}</span>
                      <span>score: {item.predictionScore.toFixed(2)}</span>
                      <span>
                        diff:{" "}
                        {formatDiff(
                          item.diffValue,
                          (baselineProposal ?? pendingStage)?.response.diff_metric
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="lifecycle-button"
                onClick={
                  baselineProposal
                    ? handleApproveBaseline
                    : handleApprovePending
                }
              >
                {baselineProposal ? "Leg baseline vast" : "Keur kandidaat goed"}
              </button>
            </section>
          )}

          {activeStage && (
            <section className="lifecycle-card">
              <div className="lifecycle-card-header">
                <h2>Actieve stage</h2>
                <span className={`lifecycle-decision ${activeStage.autoApplied ? "is-auto" : "is-manual"}`}>
                  {activeStage.autoApplied ? "auto" : "manueel"}
                </span>
              </div>
              <dl className="lifecycle-facts">
                <div>
                  <dt>Collectie</dt>
                  <dd>{formatCollectionLabel(activeStage.collection)}</dd>
                </div>
                <div>
                  <dt>Evaluate status</dt>
                  <dd>{activeStage.evaluation ?? "onbekend"}</dd>
                </div>
                <div>
                  <dt>Prediction score</dt>
                  <dd>{activeStage.predictionScore.toFixed(2)}</dd>
                </div>
                <div>
                  <dt>Beslissing</dt>
                  <dd>{activeStage.reason}</dd>
                </div>
                <div>
                  <dt>Observations</dt>
                  <dd>{metadataSummary.observationCount}</dd>
                </div>
                <div>
                  <dt>Referentieversie</dt>
                  <dd>{metadataSummary.referenceVersion}</dd>
                </div>
              </dl>
            </section>
          )}

          <section className="lifecycle-card">
            <div className="lifecycle-card-header">
              <h2>Metadata-geheugen</h2>
            </div>
            <p className="lifecycle-help">
              Deze viewer geeft BRDR metadata telkens opnieuw mee als input, zodat observaties en referentiecontext een lifecycle doorheen versies kunnen dragen.
            </p>
            <div className="lifecycle-chip-row">
              <span className="lifecycle-chip">actuation: {metadataSummary.actuation}</span>
              <span className="lifecycle-chip">
                ref features: {activeStage?.observation.referenceFeatureCount ?? 0}
              </span>
              <span className="lifecycle-chip">
                open domein:{" "}
                {activeStage?.observation.referenceOdArea !== null &&
                activeStage?.observation.referenceOdArea !== undefined
                  ? activeStage.observation.referenceOdArea.toFixed(2)
                  : "-"}
              </span>
            </div>
            <pre className="lifecycle-json">
              {JSON.stringify(activeStage?.metadata ?? null, null, 2)}
            </pre>
          </section>

          {(error || statusText) && (
            <section className="lifecycle-card lifecycle-card-status">
              <div className="lifecycle-card-header">
                <h2>Status</h2>
              </div>
              {error && <p className="lifecycle-error">{error}</p>}
              <p className="lifecycle-status-text">{statusText}</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
