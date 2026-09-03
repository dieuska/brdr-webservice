import { startTransition, useEffect, useMemo, useRef, useState } from "react";
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
const DEFAULT_LIFECYCLE_GEOMETRY: Geometry = {
  type: "Polygon",
  coordinates: [
    [
      [173109.33679364336, 172317.95747350444],
      [173118.31999726599, 172316.86559240113],
      [173117.32737808116, 172312.00175839552],
      [173108.64196021398, 172313.98699676516],
      [173109.33679364336, 172317.95747350444],
    ],
  ],
};

const SECONDARY_LIFECYCLE_GEOMETRY: Geometry = {
  type: "Polygon",
  coordinates: [
    [
      [172373.49450000009, 171916.36339999992],
      [172375.07079888537, 171915.86060035555],
      [172381.56139999992, 171913.79009999993],
      [172386.07739999992, 171912.34940000001],
      [172382.07879999964, 171901.1977999993],
      [172380.9352, 171899.06330000001],
      [172353.03710000042, 171909.17959999992],
      [172346.1404000001, 171915.37019999992],
      [172323.24830000018, 171898.63199999993],
      [172303.08080000008, 171908.80360000002],
      [172319.65799999999, 171920.94149999998],
      [172331.64050000018, 171929.7151],
      [172358.60449999999, 171921.1135000001],
      [172373.49450000009, 171916.36339999992],
    ],
  ],
};

const DRAFT_PRESETS = [
  {
    id: "preset-1",
    label: "Startpolygon A",
    geometry: DEFAULT_LIFECYCLE_GEOMETRY,
  },
  {
    id: "preset-2",
    label: "Startpolygon B",
    geometry: SECONDARY_LIFECYCLE_GEOMETRY,
  },
] as const;

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

interface MetadataSummary {
  actuation: string;
  observationCount: number;
  referenceVersion: string;
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

function buildLifecycleProperties(metadata?: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object") {
    return {};
  }

  const record = structuredClone(metadata) as Record<string, unknown>;
  const properties: Record<string, unknown> = {
    metadata: record,
    brdr_metadata: record,
  };

  if (typeof record.actuation === "string") {
    properties.actuation = record.actuation;
  }
  if (Array.isArray(record.observations)) {
    properties.observations = record.observations;
  }
  if (typeof record.reference_version === "string") {
    properties.reference_version = record.reference_version;
  }

  return properties;
}

function buildLifecycleRequest(
  geometry: Geometry,
  collectionId: string,
  metadata?: unknown,
  maxRelevantDistance = 8
): BrdrRequestBody {
  const requestBody = structuredClone(getDefaultRequestBody());
  requestBody.featurecollection.features = [
    {
      type: "Feature",
      id: "lifecycle-1",
      properties: buildLifecycleProperties(metadata),
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
    max_relevant_distance: maxRelevantDistance,
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
  const items = getStepKeys(response)
    .map((stepKey) => ({
      stepKey,
      evaluation: response.evaluations?.[stepKey] ?? null,
      predictionScore: response.prediction_scores?.[stepKey] ?? 0,
      diffValue: response.diffs?.[stepKey] ?? 0,
      isPrediction: response.predictions?.[stepKey] ?? false,
      metadata: response.metadata?.[stepKey],
    }))
    .filter((item) => item.evaluation !== null);

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
  const actuation =
    record.actuation && typeof record.actuation === "object"
      ? (record.actuation as Record<string, unknown>)
      : record;
  const referenceGeometries = Array.isArray(actuation.reference_geometries)
    ? (actuation.reference_geometries as unknown[])
    : Array.isArray(record.reference_geometries)
      ? (record.reference_geometries as unknown[])
      : [];
  const referenceGeometryEntries = referenceGeometries.filter(
    (value): value is Record<string, unknown> =>
      Boolean(value) && typeof value === "object" && !Array.isArray(value)
  );

  const procedure =
    actuation.procedure && typeof actuation.procedure === "object"
      ? (actuation.procedure as Record<string, unknown>)
      : null;
  const inputs = Array.isArray(procedure?.["ssn:hasInput"])
    ? (procedure?.["ssn:hasInput"] as unknown[])
    : [];
  let relevantDistance: number | null = null;
  for (const item of inputs) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const input = item as Record<string, unknown>;
    if (input.id !== "brdr:relevant_distance") {
      continue;
    }
    const inputValue =
      input.input_value && typeof input.input_value === "object"
        ? (input.input_value as Record<string, unknown>)
        : null;
    const value = inputValue?.value;
    if (typeof value === "number" && Number.isFinite(value)) {
      relevantDistance = value;
      break;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        relevantDistance = parsed;
        break;
      }
    }
  }

  return {
    full:
      typeof actuation.full === "boolean"
        ? actuation.full
        : typeof record.full === "boolean"
          ? record.full
          : null,
    referenceFeatureCount: referenceGeometryEntries.length,
    fullReferenceFeatureCount: referenceGeometryEntries.filter(
      (entry) => entry.full === true
    ).length,
    referenceOdArea:
      relevantDistance !== null ? relevantDistance : extractReferenceOdArea(record.reference_od),
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
    throw new Error("Geen BRDR-kandidaten met Evaluation ontvangen.");
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

function summarizeMetadata(metadata: unknown): MetadataSummary {
  if (!metadata || typeof metadata !== "object") {
    return { actuation: "geen", observationCount: 0, referenceVersion: "-" };
  }

  const record = metadata as Record<string, unknown>;
  const actuationRecord =
    record.actuation && typeof record.actuation === "object"
      ? (record.actuation as Record<string, unknown>)
      : record;
  const actuation =
    typeof actuationRecord.id === "string"
      ? actuationRecord.id
      : typeof record.alignment_date === "string"
        ? `alignment ${record.alignment_date}`
        : "beschikbaar";
  const observations = Array.isArray(actuationRecord.observations)
    ? actuationRecord.observations.length
    : Array.isArray(record.observations)
      ? record.observations.length
      : 0;
  const referenceGeometries = Array.isArray(actuationRecord.reference_geometries)
    ? (actuationRecord.reference_geometries as unknown[])
    : Array.isArray(record.reference_geometries)
      ? (record.reference_geometries as unknown[])
      : [];
  const referenceVersionEntry = referenceGeometries.find(
    (entry): entry is Record<string, unknown> =>
      Boolean(entry) &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      typeof (entry as Record<string, unknown>).version_date === "string"
  );
  const referenceVersion =
    (referenceVersionEntry && typeof referenceVersionEntry.version_date === "string"
      ? referenceVersionEntry.version_date
      : null) ??
    (typeof actuationRecord.version_date === "string"
      ? actuationRecord.version_date
      : typeof record.version_date === "string"
        ? record.version_date
        : "-");

  return {
    actuation,
    observationCount: observations,
    referenceVersion,
  };
}

function extractCapakeyList(metadata: unknown): string[] {
  const capakeyDetailsByValue = new Map<string, number>();

  function getRecord(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  function readStringField(record: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return "";
  }

  function readNumberField(record: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return null;
  }

  function readReferenceGeometryMap(root: Record<string, unknown>) {
    const map = new Map<string, string>();
    const collections: unknown[] = [];

    if (Array.isArray(root.reference_geometries)) {
      collections.push(...root.reference_geometries);
    }

    const actuation = getRecord(root.actuation);
    if (actuation && Array.isArray(actuation.reference_geometries)) {
      collections.push(...actuation.reference_geometries);
    }

    for (const item of collections) {
      const geometry = getRecord(item);
      const urn = readStringField(geometry ?? {}, ["id"]);
      const capakey = readStringField(getRecord(geometry?.derived_from) ?? {}, ["id"]);
      if (urn && capakey) {
        map.set(urn, capakey);
      }
    }

    return map;
  }

  function readReferenceFeaturePercentages(root: Record<string, unknown>) {
    const featureMaps: unknown[] = [root.reference_features];
    const actuation = getRecord(root.actuation);
    if (actuation) {
      featureMaps.push(actuation.reference_features);
    }

    for (const featureMap of featureMaps) {
      if (!featureMap || typeof featureMap !== "object" || Array.isArray(featureMap)) {
        continue;
      }
      for (const [capakey, detailsValue] of Object.entries(featureMap)) {
        const details = getRecord(detailsValue);
        const percentage = readNumberField(details ?? {}, [
          "percentage",
          "overlap_percentage",
        ]);
        if (percentage !== null && percentage >= 0) {
          capakeyDetailsByValue.set(capakey, percentage);
        }
      }
    }
  }

  function readObservations(root: Record<string, unknown>) {
    const observations: unknown[] = [];

    if (Array.isArray(root.observations)) {
      observations.push(...root.observations);
    } else if (root.observations && typeof root.observations === "object") {
      observations.push(...Object.values(root.observations));
    }

    const actuation = getRecord(root.actuation);
    if (actuation && Array.isArray(actuation.observations)) {
      observations.push(...actuation.observations);
    }

    if (Array.isArray(root.reference_observations)) {
      observations.push(...root.reference_observations);
    } else if (root.reference_observations && typeof root.reference_observations === "object") {
      observations.push(...Object.values(root.reference_observations));
    }
    if (actuation && Array.isArray(actuation.reference_observations)) {
      observations.push(...actuation.reference_observations);
    }

    return observations;
  }

  function addFromObservationNode(
    node: unknown,
    referenceGeometryByUrn: Map<string, string>
  ) {
    const record = getRecord(node);
    if (!record) {
      return;
    }

    // Some BRDR versions put the reference feature map inside an observation.
    readReferenceFeaturePercentages(record);

    const observedProperty = readStringField(record, [
      "observed_property",
      "observedProperty",
    ]);
    const usedProcedure = readStringField(record, ["used_procedure", "usedProcedure"]);
    const resultRecord = getRecord(record.result);
    const resultValue = resultRecord?.value ?? record.result_value ?? record.resultValue;
    const percentageValue =
      readNumberField(record, ["result_value", "resultValue"]) ??
      (typeof resultValue === "number" ? resultValue : Number(resultValue));

    if (
      !observedProperty.toLowerCase().includes("percentage") &&
      !usedProcedure.toLowerCase().includes("percentage")
    ) {
      return;
    }
    if (!Number.isFinite(percentageValue) || percentageValue < 0) {
      return;
    }

    const featureOfInterest = readStringField(record, [
      "has_feature_of_interest",
      "hasFeatureOfInterest",
      "feature_of_interest",
      "featureOfInterest",
      "used",
    ]);

    if (!featureOfInterest) {
      return;
    }

    const capakey = referenceGeometryByUrn.get(featureOfInterest) ?? featureOfInterest;
    const current = capakeyDetailsByValue.get(capakey);
    if (current === undefined || percentageValue > current) {
      capakeyDetailsByValue.set(capakey, percentageValue);
    }
  }

  let parsedMetadata = metadata;
  if (typeof parsedMetadata === "string") {
    try {
      parsedMetadata = JSON.parse(parsedMetadata);
    } catch {
      return [];
    }
  }

  const roots = Array.isArray(parsedMetadata)
    ? parsedMetadata.map(getRecord).filter((root): root is Record<string, unknown> => Boolean(root))
    : [getRecord(parsedMetadata)].filter(
        (root): root is Record<string, unknown> => Boolean(root)
      );
  if (roots.length === 0) {
    return [];
  }

  for (const root of roots) {
    const referenceGeometryByUrn = readReferenceGeometryMap(root);
    readReferenceFeaturePercentages(root);

    for (const observation of readObservations(root)) {
      addFromObservationNode(observation, referenceGeometryByUrn);
    }
  }

  return Array.from(capakeyDetailsByValue.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([capakey, percentage]) => `${capakey} (${percentage.toFixed(2)}%)`);
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
  const [showReferenceLayer, setShowReferenceLayer] = useState(true);
  const [showGrbBackground, setShowGrbBackground] = useState(false);
  const [includeRequestMetadata, setIncludeRequestMetadata] = useState(true);
  const [drawRequestToken, setDrawRequestToken] = useState(1);
  const [draftGeometry, setDraftGeometry] = useState<Geometry | null>(
    DRAFT_PRESETS[0].geometry
  );
  const [initialGeometry, setInitialGeometry] = useState<Geometry | null>(
    DRAFT_PRESETS[0].geometry
  );
  const [draftPresetId, setDraftPresetId] = useState<string>(DRAFT_PRESETS[0].id);
  const [baselineProposal, setBaselineProposal] = useState<LifecycleStage | null>(null);
  const [baselineSelectedStepKey, setBaselineSelectedStepKey] = useState("");
  const [acceptedStages, setAcceptedStages] = useState<LifecycleStage[]>([]);
  const [pendingStage, setPendingStage] = useState<LifecycleStage | null>(null);
  const [pendingSelectedStepKey, setPendingSelectedStepKey] = useState("");
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [sliderStageIndex, setSliderStageIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoBaselineMode, setAutoBaselineMode] = useState(false);
  const [autoPlayStartIndex, setAutoPlayStartIndex] = useState<number | null>(null);
  const isPlayingRef = useRef(false);
  const [collapsedSteps, setCollapsedSteps] = useState<Record<number, boolean>>({ 1: true });
  const [unmanagedImpactItems, setUnmanagedImpactItems] = useState<string[]>([]);
  const [managedImpactItems, setManagedImpactItems] = useState<string[]>([]);
  const [impactPreviewLoading, setImpactPreviewLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState(
    "Standaardpolygon geladen. Kies een historische AdpF-versie als baseline of teken een nieuwe polygon."
  );
  const [error, setError] = useState<string | null>(null);
  const initialBaselineStartedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadCollections() {
      setCollectionsLoading(true);
      setCollectionsError(null);
      try {
        const nextCollections = await fetchAdpfCollections();
        if (cancelled) return;
        setCollections(nextCollections);
        setBaselineCollectionId(
          nextCollections.find((collection) => collection.id.toLowerCase() === "adpf2022")?.id ??
            nextCollections[0]?.id ??
            ""
        );
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

  const sliderMax = Math.max(lifecycleCollections.length > 0 ? lifecycleCollections.length - 1 : 0, 0);
  const sliderValue = Math.min(sliderStageIndex, sliderMax);
  const currentLifecycleCollection =
    lifecycleCollections[Math.min(sliderValue, lifecycleCollections.length - 1)] ?? null;
  const baselineStage = acceptedStages[0] ?? null;

  const activeStage =
    pendingStage && activeStageIndex > 0
      ? buildStageFromResponse(
          pendingStage.collection,
          pendingStage.response,
          pendingStage.sourceGeometry,
          baselineStage?.metadata,
          pendingSelectedStepKey || pendingStage.selectedStepKey,
          false
        )
      : acceptedStages[activeStageIndex] ?? null;

  const metadataSummary = summarizeMetadata(activeStage?.metadata);
  async function executeAlignment(
    geometry: Geometry,
    collection: AdpfCollectionSummary,
    metadata?: unknown,
    maxRelevantDistance = 8
  ) {
    const requestBody = buildLifecycleRequest(
      geometry,
      collection.id,
      includeRequestMetadata ? metadata : undefined,
      maxRelevantDistance
    );
    return fetchBrdrResponse(requestBody, { includeMetadata: true });
  }

  function resetLifecycleForNewGeometry(nextGeometry: Geometry, nextPresetId = "custom") {
    startTransition(() => {
      setIsPlaying(false);
      setAutoBaselineMode(false);
      setAutoPlayStartIndex(null);
      setDraftGeometry(nextGeometry);
      setInitialGeometry(geometryClone(nextGeometry));
      setDraftPresetId(nextPresetId);
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

  useEffect(() => {
    if (
      initialBaselineStartedRef.current ||
      collectionsLoading ||
      !draftGeometry ||
      baselineCollectionId.toLowerCase() !== "adpf2022" ||
      acceptedStages.length > 0 ||
      baselineProposal ||
      loading
    ) {
      return;
    }

    initialBaselineStartedRef.current = true;
    void handleRunBaseline();
  }, [
    acceptedStages.length,
    baselineCollectionId,
    baselineProposal,
    collectionsLoading,
    draftGeometry,
    loading,
  ]);

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
    const baseline = acceptedStages[0];
    if (!baseline) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const collection = lifecycleCollections[targetIndex];
      if (!collection) {
        return;
      }

      setStatusText(`Lifecycle alignering gestart voor ${formatCollectionLabel(collection)}.`);
      const response = await executeAlignment(
        baseline.managedGeometry,
        collection,
        baseline.metadata
      );
      const nextStage = buildStageFromResponse(
        collection,
        response,
        baseline.managedGeometry,
        baseline.metadata
      );

      if (!nextStage.autoApplied) {
        startTransition(() => {
          isPlayingRef.current = false;
          setIsPlaying(false);
          setPendingStage(nextStage);
          setPendingSelectedStepKey(nextStage.selectedStepKey);
          setActiveStageIndex(targetIndex === 0 ? 0 : 1);
          setSliderStageIndex(targetIndex);
          setStatusText(
            `Review nodig voor ${formatCollectionLabel(collection)}. Kies een voorstel om deze doelversie rechtstreeks vanaf de baseline te bevestigen.`
          );
        });
        return;
      }

      if (isPlaying && isPlayingRef.current) {
        const nextBaseline: LifecycleStage = {
          ...nextStage,
          sourceGeometry: geometryClone(nextStage.candidateGeometry),
          candidateGeometry: geometryClone(nextStage.candidateGeometry),
          managedGeometry: geometryClone(nextStage.candidateGeometry),
          autoApplied: true,
        };
        startTransition(() => {
          setBaselineCollectionId(collection.id);
          setAcceptedStages([nextBaseline]);
          setPendingStage(null);
          setPendingSelectedStepKey("");
          setActiveStageIndex(0);
          setSliderStageIndex(0);
          setStatusText(
            `${formatCollectionLabel(collection)} is automatisch de nieuwe baseline geworden.`
          );
        });
        return;
      }

      startTransition(() => {
        setAcceptedStages(targetIndex === 0 ? [baseline] : [baseline, nextStage]);
        setPendingStage(null);
        setPendingSelectedStepKey("");
        setActiveStageIndex(targetIndex === 0 ? 0 : 1);
        setSliderStageIndex(targetIndex);
        setStatusText("Lifecycle automatisch bijgewerkt vanaf de baseline naar de gekozen versie.");
      });
    } catch (err) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      setAutoBaselineMode(false);
      setSliderStageIndex(activeStageIndex);
      setError(err instanceof Error ? err.message : "Lifecycle update mislukte.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (
      !isPlaying ||
      loading ||
      pendingStage ||
      baselineProposal ||
      acceptedStages.length === 0
    ) {
      return;
    }

    if (sliderValue >= sliderMax) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      setAutoBaselineMode(false);
      setStatusText("Automatische lifecycle is tot de laatste AdpF-versie doorgelopen.");
      return;
    }

    void advanceLifecycleTo(sliderValue + 1);
  }, [
    acceptedStages.length,
    baselineProposal,
    isPlaying,
    lifecycleCollections,
    loading,
    pendingStage,
    sliderMax,
    sliderValue,
  ]);

  async function handleSliderChange(nextIndex: number) {
    if (acceptedStages.length === 0) {
      return;
    }

    setSliderStageIndex(nextIndex);

    if (pendingStage) {
      setStatusText("Los eerst de huidige review op voordat je een andere doelversie kiest.");
      return;
    }

    if (nextIndex === 0) {
      setActiveStageIndex(0);
      setStatusText("Toon de baseline-stage.");
      return;
    }

    if (acceptedStages[1]?.collection.id === lifecycleCollections[nextIndex]?.id) {
      setActiveStageIndex(1);
      setStatusText(`Toon doelversie ${formatCollectionLabel(lifecycleCollections[nextIndex])}.`);
      return;
    }

    await advanceLifecycleTo(nextIndex);
  }

  function handleApprovePending() {
    if (!pendingStage) return;
    const baseline = acceptedStages[0];
    const previousMetadata = baseline?.metadata;
    const approved = buildStageFromResponse(
      pendingStage.collection,
      pendingStage.response,
      pendingStage.sourceGeometry,
      previousMetadata,
      pendingSelectedStepKey || pendingStage.selectedStepKey,
      true
    );

    if (autoBaselineMode) {
      const approvedBaseline: LifecycleStage = {
        ...approved,
        sourceGeometry: geometryClone(approved.managedGeometry),
        candidateGeometry: geometryClone(approved.managedGeometry),
        managedGeometry: geometryClone(approved.managedGeometry),
        autoApplied: true,
      };
      startTransition(() => {
        setBaselineCollectionId(approved.collection.id);
        setAcceptedStages([approvedBaseline]);
        setPendingStage(null);
        setPendingSelectedStepKey("");
        setActiveStageIndex(0);
        setSliderStageIndex(0);
        setIsPlaying(true);
        setStatusText(
          `${formatCollectionLabel(approved.collection)} is als nieuwe baseline vastgelegd. Automatische lifecycle wordt hervat.`
        );
      });
      return;
    }

    startTransition(() => {
      const nextStages = baseline ? [baseline, approved] : [approved];
      setAcceptedStages(nextStages);
      setPendingStage(null);
      setPendingSelectedStepKey("");
      setActiveStageIndex(nextStages.length - 1);
      const approvedIndex = lifecycleCollections.findIndex(
        (collection) => collection.id === approved.collection.id
      );
      setSliderStageIndex(approvedIndex >= 0 ? approvedIndex : 0);
      setStatusText(`Review bevestigd voor ${formatCollectionLabel(approved.collection)}.`);
    });
  }

  function handlePromoteActiveToBaseline() {
    if (!activeStage || pendingStage || baselineProposal) {
      return;
    }

    const baselineGeometry = geometryClone(activeStage.managedGeometry);
    const promotedBaseline: LifecycleStage = {
      ...activeStage,
      sourceGeometry: geometryClone(baselineGeometry),
      candidateGeometry: geometryClone(baselineGeometry),
      managedGeometry: geometryClone(baselineGeometry),
      autoApplied: true,
    };

    startTransition(() => {
      setAutoBaselineMode(false);
      setBaselineCollectionId(activeStage.collection.id);
      setDraftGeometry(geometryClone(baselineGeometry));
      setDraftPresetId("custom");
      setAcceptedStages([promotedBaseline]);
      setPendingStage(null);
      setPendingSelectedStepKey("");
      setBaselineProposal(null);
      setBaselineSelectedStepKey("");
      setActiveStageIndex(0);
      setSliderStageIndex(0);
      setStatusText(
        `${formatCollectionLabel(activeStage.collection)} is als nieuwe baseline vastgelegd.`
      );
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
  const baselineLabel = baselineStage
    ? formatCollectionLabel(baselineStage.collection)
    : "Geen baseline ingesteld";
  const impactContextLabel = currentLifecycleCollection
    ? formatCollectionLabel(currentLifecycleCollection)
    : baselineLabel;
  const selectedDraftPresetLabel =
    DRAFT_PRESETS.find((preset) => preset.id === draftPresetId)?.label ?? "Eigen polygon";
  const baselineProgressIndex = baselineStage
    ? collections.findIndex((collection) => collection.id === baselineStage.collection.id)
    : -1;
  const autoPlayStart = autoPlayStartIndex ?? baselineProgressIndex;
  const lifecycleProgress =
    collections.length > 1 && baselineProgressIndex >= autoPlayStart && autoPlayStart >= 0
      ? ((baselineProgressIndex - autoPlayStart) /
          Math.max(collections.length - 1 - autoPlayStart, 1)) *
        100
      : 0;

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  function toggleStep(step: number) {
    setCollapsedSteps((current) => ({ ...current, [step]: !current[step] }));
  }

  const managedGeometryForMap =
    pendingStage
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
      : pendingStage
        ? buildStageFromResponse(
            pendingStage.collection,
            pendingStage.response,
            pendingStage.sourceGeometry,
            baselineStage?.metadata,
            pendingSelectedStepKey || pendingStage.selectedStepKey,
          false
          ).candidateGeometry
        : null;
  const impactInputGeometry = initialGeometry ?? baselineProposal?.sourceGeometry ?? null;
  const selectedReviewMetadata = baselineProposal
    ? baselineProposal.response.metadata?.[
        baselineSelectedStepKey || baselineProposal.selectedStepKey
      ]
    : pendingStage
      ? pendingStage.response.metadata?.[
          pendingSelectedStepKey || pendingStage.selectedStepKey
        ]
      : null;
  const visibleManagedImpactItems = selectedReviewMetadata
    ? extractCapakeyList(selectedReviewMetadata)
    : managedImpactItems;

  useEffect(() => {
    let cancelled = false;

    async function refreshImpactPreview() {
      if (
        !currentLifecycleCollection ||
        !impactInputGeometry ||
        (!managedGeometryForMap && !selectedReviewMetadata)
      ) {
        setUnmanagedImpactItems([]);
        setManagedImpactItems([]);
        return;
      }

      setImpactPreviewLoading(true);
      try {
        const unmanagedResponse = await executeAlignment(
          impactInputGeometry,
          currentLifecycleCollection,
          undefined,
          0
        );

        if (cancelled) {
          return;
        }

        const unmanagedZeroDistanceMetadata =
          unmanagedResponse.metadata?.["0.0"] ?? unmanagedResponse.metadata?.["0"];
        const managedResponse = managedGeometryForMap
          ? await executeAlignment(
              managedGeometryForMap,
              currentLifecycleCollection,
              undefined,
              0
            )
          : null;
        const managedZeroDistanceMetadata = managedResponse
          ? managedResponse.metadata?.["0.0"] ?? managedResponse.metadata?.["0"]
          : undefined;
        setUnmanagedImpactItems(extractCapakeyList(unmanagedZeroDistanceMetadata));
        if (managedGeometryForMap && managedZeroDistanceMetadata !== undefined) {
          setManagedImpactItems(extractCapakeyList(managedZeroDistanceMetadata));
        }
      } catch {
        if (!cancelled) {
          setUnmanagedImpactItems([]);
          setManagedImpactItems([]);
        }
      } finally {
        if (!cancelled) {
          setImpactPreviewLoading(false);
        }
      }
    }

    void refreshImpactPreview();
    return () => {
      cancelled = true;
    };
  }, [
    currentLifecycleCollection,
    includeRequestMetadata,
    impactInputGeometry,
    managedGeometryForMap,
  ]);

  return (
    <div className="lifecycle-app">
      <section className="lifecycle-hero">
        <div className="lifecycle-hero-copy">
          <a className="viewer-home-link" href={import.meta.env.BASE_URL}>← Demo-overzicht</a>
          <p className="lifecycle-eyebrow">GeoLifecycleManager</p>
          <h1>Volg de geometrische levensloop van een dossier</h1>
          <p className="lifecycle-intro">
            Start met één geometrie en volg ze doorheen opeenvolgende AdpF-versies. BRDR gebruikt
            de referentie van elk jaar om de beheerde geometrie automatisch bij te werken en stopt
            alleen wanneer een manuele keuze nodig is.
          </p>
        </div>
        <div className="lifecycle-hero-overview">
          <div className="lifecycle-hero-metric">
            <span className="status-kpi-label">Actieve baseline</span>
            <strong>{baselineLabel}</strong>
          </div>
          <div className="lifecycle-hero-metric">
            <span className="status-kpi-label">Lifecycle status</span>
            <strong>{pendingStage || baselineProposal ? "ACTIE VEREIST" : isPlaying ? "Automatisch actief" : "Klaar"}</strong>
          </div>
        </div>
      </section>

      {(baselineProposal || pendingStage) && (
        <div className="lifecycle-review-banner" role="alert">
          <div>
            <strong>Actie vereist: kies een kandidaat</strong>
            <span>
              {pendingStage
                ? "De automatische lifecycle staat gepauzeerd tot je deze review bevestigt."
                : "Kies de geometrie die als baseline moet worden vastgelegd."}
            </span>
          </div>
          <button
            type="button"
            onClick={() => document.getElementById("lifecycle-review-card")?.scrollIntoView({ behavior: "smooth" })}
          >
            Naar review
          </button>
        </div>
      )}

      <div className="lifecycle-layout">
        <div className="lifecycle-map-panel">
          <GeoLifecycleMap
            referenceCollectionId={currentCollectionId}
            showReferenceLayer={showReferenceLayer}
            showGrbBackground={showGrbBackground}
            originalGeometry={initialGeometry ?? draftGeometry}
            managedGeometry={managedGeometryForMap}
            proposalGeometry={proposalGeometryForMap}
            draftGeometry={draftGeometry}
            unmanagedImpactItems={unmanagedImpactItems}
            managedImpactItems={visibleManagedImpactItems}
            impactContextLabel={impactContextLabel}
            loading={loading || impactPreviewLoading}
            drawRequestToken={drawRequestToken}
            onDrawn={resetLifecycleForNewGeometry}
          />
        </div>

        <aside className="lifecycle-sidebar">
          <section className={`lifecycle-card lifecycle-step-card${collapsedSteps[1] ? " is-collapsed" : ""}`}>
            <div className="lifecycle-card-header">
              <h2>1. Dossier</h2>
              <button
                type="button"
                className="lifecycle-button lifecycle-button-secondary"
                onClick={() => setDrawRequestToken((value) => value + 1)}
              >
                Teken opnieuw
              </button>
              <button
                type="button"
                className="lifecycle-step-toggle"
                onClick={() => toggleStep(1)}
                aria-expanded={!collapsedSteps[1]}
                aria-label={`${collapsedSteps[1] ? "Open" : "Klap in"} stap 1`}
              >
                {collapsedSteps[1] ? "+" : "−"}
              </button>
            </div>
            <p className="lifecycle-help">
              Werk in EPSG:31370. De getekende polygon blijft zichtbaar als blauwe brongeometrie.
            </p>
            <div className="lifecycle-preset-row" role="group" aria-label="Kies een startpolygon">
              {DRAFT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`lifecycle-preset-button${
                    draftPresetId === preset.id ? " is-active" : ""
                  }`}
                  onClick={() => resetLifecycleForNewGeometry(preset.geometry, preset.id)}
                  disabled={loading}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="lifecycle-chip-row">
              <span className={`lifecycle-chip${draftGeometry ? " is-active" : ""}`}>
                {draftGeometry ? "polygon klaar" : "nog geen polygon"}
              </span>
              <span className="lifecycle-chip">{selectedDraftPresetLabel}</span>
              <span className="lifecycle-chip">{currentCollectionId || "geen collectie"}</span>
            </div>

          <div className="lifecycle-step-divider" />
          <h3 className="lifecycle-step-subtitle">Initiële alignering</h3>
            <div className="lifecycle-card-header">
              <h2>2. Leg de baseline vast</h2>
              <button
                type="button"
                className="lifecycle-step-toggle"
                onClick={() => toggleStep(2)}
                aria-expanded={!collapsedSteps[2]}
                aria-label={`${collapsedSteps[2] ? "Open" : "Klap in"} stap 2`}
              >
                {collapsedSteps[2] ? "+" : "−"}
              </button>
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
            <details className="lifecycle-technical-options">
              <summary>Technische kaart- en metadataopties</summary>
              <div className="lifecycle-switch-row">
                <div>
                  <strong>GRB-achtergrondlaag</strong>
                  <p>Toon de recente GRB-situatie als visuele achtergrond.</p>
                </div>
                <label className="lifecycle-switch" aria-label="Toon GRB-achtergrondlaag">
                  <input
                    type="checkbox"
                    checked={showGrbBackground}
                    onChange={(event) => setShowGrbBackground(event.target.checked)}
                  />
                  <span className="lifecycle-switch-track" />
                </label>
              </div>
              <div className="lifecycle-switch-row">
                <div>
                  <strong>AdpF-referentielaag</strong>
                  <p>Toon polygonen van de actieve collectie op de kaart.</p>
                </div>
                <label className="lifecycle-switch" aria-label="Toon OGC Feature API polygonen">
                  <input
                    type="checkbox"
                    checked={showReferenceLayer}
                    onChange={(event) => setShowReferenceLayer(event.target.checked)}
                  />
                  <span className="lifecycle-switch-track" />
                </label>
              </div>
              <div className="lifecycle-switch-row">
                <div>
                  <strong>Lifecycle-metadata meegeven</strong>
                  <p>Stuur de vorige metadata opnieuw mee naar BRDR.</p>
                </div>
                <label className="lifecycle-switch" aria-label="Stuur metadata mee naar BRDR">
                  <input
                    type="checkbox"
                    checked={includeRequestMetadata}
                    onChange={(event) => setIncludeRequestMetadata(event.target.checked)}
                  />
                  <span className="lifecycle-switch-track" />
                </label>
              </div>
            </details>
            {collectionsError && <p className="lifecycle-error">{collectionsError}</p>}
          </section>

          {acceptedStages.length > 0 && (
            <section className={`lifecycle-card lifecycle-step-card${collapsedSteps[2] ? " is-collapsed" : ""}`}>
              <div className="lifecycle-card-header">
                <h2>2. Volg de levensloop</h2>
                <span className="lifecycle-stage-label">
                  {activeStageIndex === 0 ? "baseline" : "doelversie"}
                </span>
                <button
                  type="button"
                  className="lifecycle-step-toggle"
                  onClick={() => toggleStep(2)}
                  aria-expanded={!collapsedSteps[2]}
                  aria-label={`${collapsedSteps[2] ? "Open" : "Klap in"} stap 2`}
                >
                  {collapsedSteps[2] ? "+" : "−"}
                </button>
              </div>
              <div className="lifecycle-slider-status">
                <strong>
                  {currentLifecycleCollection
                    ? formatCollectionLabel(currentLifecycleCollection)
                    : "Geen lifecycle-versie"}
                </strong>
                <p>Kies een jaar of start de automatische opvolging vanaf de actieve baseline.</p>
              </div>
              {(isPlaying || loading) && (
                <div className="lifecycle-play-progress" aria-live="polite">
                  <div className="lifecycle-play-progress-label">
                    <span>Automatische lifecycle</span>
                    <strong>{Math.round(lifecycleProgress)}%</strong>
                  </div>
                  <div className="lifecycle-play-progress-track">
                    <div
                      className="lifecycle-play-progress-value"
                      style={{ width: `${lifecycleProgress}%` }}
                    />
                  </div>
                  <p>
                    {loading
                      ? "BRDR berekent de volgende jaarstap…"
                      : `Volgende stap: ${formatCollectionLabel(lifecycleCollections[Math.min(sliderValue + 1, sliderMax)])}`}
                  </p>
                </div>
              )}
              <div className="lifecycle-target-grid" role="group" aria-label="Kies lifecycle doelversie">
                {lifecycleCollections.map((collection, index) => {
                  const isActive = index === sliderValue;
                  const isBlockedByReview = Boolean(pendingStage) && index > acceptedStages.length;
                  return (
                    <button
                      key={collection.id}
                      type="button"
                      className={`lifecycle-target-button${isActive ? " is-active" : ""}`}
                      onClick={() => void handleSliderChange(index)}
                      disabled={
                        isPlaying || loading || collectionsLoading || isBlockedByReview
                      }
                    >
                      <strong>{collection.year ? collection.year : collection.id}</strong>
                      <span>{collection.id}</span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="lifecycle-button lifecycle-button-play"
                onClick={() => {
                  if (isPlaying) {
                    isPlayingRef.current = false;
                    setIsPlaying(false);
                    setAutoBaselineMode(false);
                    setStatusText("Automatische lifecycle gepauzeerd.");
                  } else if (sliderValue < sliderMax) {
                    isPlayingRef.current = true;
                    setAutoPlayStartIndex(baselineProgressIndex);
                    setIsPlaying(true);
                    setAutoBaselineMode(true);
                  }
                }}
                disabled={collectionsLoading || Boolean(pendingStage)}
              >
                {isPlaying ? "Pauzeer automatische lifecycle" : "▶ Start automatische lifecycle"}
              </button>
              <p className="lifecycle-help">
                De gekozen AdpF-versie wordt rechtstreeks vanaf de baseline geëvalueerd. Tussenliggende jaren worden niet eerst apart opgebouwd.
              </p>
            </section>
          )}

          {(baselineProposal || pendingStage) && (
            <section id="lifecycle-review-card" className="lifecycle-card lifecycle-card-review">
              <div className="lifecycle-card-header">
                <h2>Review nodig — actie vereist</h2>
                <span className="lifecycle-stage-label">
                  {(baselineProposal ?? pendingStage)?.collection.id}
                </span>
              </div>
              <p className="lifecycle-help">
                BRDR gaf hier geen voldoende eenduidige automatische beslissing. Kies expliciet een kandidaat.
              </p>
              <div className="lifecycle-review-alert" role="alert">
                <strong>{pendingStage ? "De automatische lifecycle is gepauzeerd." : "Een keuze is vereist om verder te gaan."}</strong>
                <span>Kies de geometrie die je wilt vastleggen en bevestig daarna de kandidaat.</span>
              </div>
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
              {!pendingStage && !baselineProposal && (
                <button
                  type="button"
                  className="lifecycle-button lifecycle-button-secondary"
                  onClick={handlePromoteActiveToBaseline}
                >
                  Gebruik als nieuwe baseline
                </button>
              )}
            </section>
          )}

          <section className="lifecycle-card">
            <div className="lifecycle-card-header">
            <h2>Lifecycle-geheugen</h2>
            </div>
            <p className="lifecycle-help">
              Deze viewer geeft BRDR metadata telkens opnieuw mee als input, zodat observaties en referentiecontext een lifecycle doorheen versies kunnen dragen.
            </p>
            <div className="lifecycle-chip-row">
              <span className="lifecycle-chip">actuation: {metadataSummary.actuation}</span>
              <span className="lifecycle-chip">
                referentiegeometries: {activeStage?.observation.referenceFeatureCount ?? 0}
              </span>
              <span className="lifecycle-chip">
                relevant distance:{" "}
                {activeStage?.observation.referenceOdArea !== null &&
                activeStage?.observation.referenceOdArea !== undefined
                  ? activeStage.observation.referenceOdArea.toFixed(2)
                  : "-"}
              </span>
            </div>
            <details className="lifecycle-metadata-details">
              <summary>Toon technische BRDR-metadata</summary>
              <pre className="lifecycle-json">
                {JSON.stringify(activeStage?.metadata ?? null, null, 2)}
              </pre>
            </details>
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
