import { useEffect, useMemo, useRef, useState } from "react";
import { GRB_REFERENCE_LAYER_OPTIONS } from "../../data/grbReferenceLayerOptions";
import { useBrdrState } from "../../state/useBrdrState";
import type { Geometry } from "../../types/brdr";
import MapView from "../map/MapView";
import {
  BASE_LAYER_BRK_LUCHTFOTO,
  BASE_LAYER_BRK_PDOK,
  BASE_LAYER_GRB_COLOR,
  BASE_LAYER_GRB_GRAY,
  BASE_LAYER_OSM,
} from "../map/layers/baseLayers";
import {
  assertSupportedCrs,
  type BrdrAlignmentParams,
  type BrdrSupportedCrs,
} from "./contracts";

export interface BrdrCompactAlignmentViewerProps {
  crs: BrdrSupportedCrs;
  inputGeometry: Geometry;
  initialRequestParams?: Partial<BrdrAlignmentParams>;
  onApplyAlignedGeometry?: (geometry: Geometry) => void;
  onLoadingChange?: (loading: boolean) => void;
  onErrorChange?: (message: string | null) => void;
}

function geometrySignature(geometry: Geometry | null): string {
  if (!geometry) return "null";
  return JSON.stringify(geometry);
}

function formatDiffValue(value: number, metric: "area" | "length" | "count") {
  if (metric === "count") {
    return `${value.toFixed(0)} pt`;
  }
  if (metric === "length") {
    return `${value.toFixed(2)} m`;
  }
  return `${value.toFixed(2)} m2`;
}

const FULL_REFERENCE_STRATEGY_OPTIONS = [
  "prefer_full_reference",
  "only_full_reference",
  "no_full_reference",
];

const OPEN_DOMAIN_STRATEGY_OPTIONS = [
  "EXCLUDE",
  "AS_IS",
  "SNAP_INNER_SIDE",
  "SNAP_ALL_SIDE",
];

const SNAP_STRATEGY_OPTIONS = [
  "ONLY_VERTICES",
  "PREFER_VERTICES",
  "PREFER_ENDS_AND_ANGLES",
  "NO_PREFERENCE",
];

const PROCESSOR_OPTIONS = [
  "AlignerGeometryProcessor",
  "DieussaertGeometryProcessor",
  "NetworkGeometryProcessor",
  "SnapGeometryProcessor",
  "TopologyProcessor",
];
const FULL_REFERENCE_STRATEGY_LABELS: Record<string, string> = {
  prefer_full_reference: "Voorkeur voor volledige referentie",
  only_full_reference: "Alleen volledige referentie",
  no_full_reference: "Geen volledige referentie",
};

const OPEN_DOMAIN_STRATEGY_LABELS: Record<string, string> = {
  EXCLUDE: "Open domein uitsluiten",
  AS_IS: "Open domein behouden",
  SNAP_INNER_SIDE: "Snappen aan binnenzijde",
  SNAP_ALL_SIDE: "Snappen aan alle zijden",
};

const SNAP_STRATEGY_LABELS: Record<string, string> = {
  ONLY_VERTICES: "Alleen hoekpunten",
  PREFER_VERTICES: "Voorkeur voor hoekpunten",
  PREFER_ENDS_AND_ANGLES: "Voorkeur voor uiteinden en hoeken",
  NO_PREFERENCE: "Geen voorkeur",
};

const PROCESSOR_LABELS: Record<string, string> = {
  AlignerGeometryProcessor: "Standaard",
  DieussaertGeometryProcessor: "Dieussaert",
  NetworkGeometryProcessor: "Netwerk",
  SnapGeometryProcessor: "Snap",
  TopologyProcessor: "Topologie",
};

export function BrdrCompactAlignmentViewer({
  crs,
  inputGeometry: externalInputGeometry,
  initialRequestParams,
  onApplyAlignedGeometry,
  onLoadingChange,
  onErrorChange,
}: BrdrCompactAlignmentViewerProps) {
  assertSupportedCrs(crs);

  const {
    steps,
    values,
    currentStep,
    stepKey,
    stepIndex,
    predictionByStep,
    predictionScoreByStep,
    currentStepPredictionScore,
    loading,
    error,
    requestParams,
    diffMetric,
    updateRequestParam,
    inputGeometry,
    updateInputGeometry,
    calculateForCurrentGeometry,
    calculateForInputGeometry,
    applyCurrentStepToInputGeometry,
    resetAppliedInputGeometry,
    hasAppliedInputGeometry,
    setStepIndex,
  } = useBrdrState({
    crs,
    initialGeometry: externalInputGeometry,
    initialRequestParams,
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const lastExternalGeometryRef = useRef<string>(
    geometrySignature(externalInputGeometry)
  );

  const canRun = Boolean(inputGeometry) && !loading;
  const canApplyStepGeometry = Boolean(currentStep) && !loading;
  const canResetStepGeometry = hasAppliedInputGeometry && !loading;

  const predictionItems = useMemo(() => {
    const predicted = steps
      .map((step, index) => ({
        step,
        index,
        diff: values[index] ?? 0,
        score: predictionScoreByStep[step] ?? 0,
      }))
      .filter(({ step }) => predictionByStep[step] ?? false)
      .sort((a, b) => b.score - a.score);

    if (predicted.length > 0) {
      return predicted;
    }

    return steps.map((step, index) => ({
      step,
      index,
      diff: values[index] ?? 0,
      score: predictionScoreByStep[step] ?? 0,
    }));
  }, [predictionByStep, predictionScoreByStep, steps, values]);
  const predictionCount = predictionItems.filter(
    (item) => predictionByStep[item.step] ?? false
  ).length;
  const metricLabel =
    diffMetric === "area" ? "oppervlakte" : diffMetric === "length" ? "lengte" : "aantal";

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  useEffect(() => {
    onErrorChange?.(error);
  }, [error, onErrorChange]);

  useEffect(() => {
    const nextExternalSignature = geometrySignature(externalInputGeometry);
    if (nextExternalSignature === lastExternalGeometryRef.current) {
      return;
    }

    lastExternalGeometryRef.current = nextExternalSignature;
    const nextGeometry = structuredClone(externalInputGeometry);
    updateInputGeometry(nextGeometry);
    void calculateForInputGeometry(nextGeometry);
  }, [calculateForInputGeometry, externalInputGeometry, updateInputGeometry]);

  function handleApplyAlignedGeometry() {
    if (!currentStep) return;
    const alignedGeometry = structuredClone(currentStep.result);
    applyCurrentStepToInputGeometry();
    onApplyAlignedGeometry?.(alignedGeometry);
  }

  const showGrbOverlay =
    !requestParams?.reference_loader || requestParams.reference_loader === "grb";
  const isWfsReference = requestParams?.reference_loader === "wfs";
  const baseLayerVisibility = showGrbOverlay
    ? undefined
    : {
        [BASE_LAYER_OSM]: false,
        [BASE_LAYER_GRB_COLOR]: false,
        [BASE_LAYER_GRB_GRAY]: false,
        [BASE_LAYER_BRK_LUCHTFOTO]: true,
        [BASE_LAYER_BRK_PDOK]: true,
      };

  return (
    <div className="app-layout">
      <div className="map-wrapper">
        <MapView
          crs={crs}
          step={currentStep}
          showReferenceLayer={showGrbOverlay}
          selectedGrbTypes={
            showGrbOverlay && requestParams?.grb_type
              ? [requestParams.grb_type]
              : undefined
          }
          baseLayerVisibility={baseLayerVisibility}
          showDiffLayers={!hasAppliedInputGeometry}
          suspendBrdrLayers={loading}
          loading={loading}
          inputGeometry={inputGeometry}
          onInputGeometryChange={updateInputGeometry}
          drawEnabled={false}
          allowGeometryEditing={false}
        />
      </div>

      <aside className="side-panel compact-side-panel">
        <div className="workflow-step-card workflow-step-card-recalculate">
          <div className="workflow-step-title">Snelle BRDR alignering</div>
          <p className="workflow-step-help">
            Herbereken en klik daarna meteen op een voorstel in de lijst rechts.
          </p>
          <div className="primary-setting">
            {!isWfsReference ? (
              <label>
                Kies GRB-referentielaag
                <select
                  value={requestParams?.grb_type ?? "GRB - ADP - administratief perceel"}
                  onChange={(event) =>
                    updateRequestParam("grb_type", event.target.value)
                  }
                >
                  {GRB_REFERENCE_LAYER_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="settings-inline-summary">
                Referentiebron: WFS (PDOK BRK percelen)
              </p>
            )}
          </div>

          <div className="settings-block">
            <button
              type="button"
              className="settings-toggle"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen(!settingsOpen)}
            >
              {settingsOpen
                ? "Geavanceerde settings verbergen"
                : "Geavanceerde settings tonen"}
            </button>

            {!settingsOpen && (
              <p className="settings-inline-summary">
                Open domein: {OPEN_DOMAIN_STRATEGY_LABELS[requestParams?.od_strategy ?? "SNAP_ALL_SIDE"]} | Snap:{" "}
                {SNAP_STRATEGY_LABELS[requestParams?.snap_strategy ?? "PREFER_VERTICES"]} | Max:{" "}
                {(requestParams?.max_relevant_distance ?? 10).toFixed(1)} m
              </p>
            )}

            {settingsOpen && (
              <div className="params-grid">
                <label>
                  Volledige referentie
                  <select
                    value={
                      requestParams?.full_reference_strategy ??
                      "prefer_full_reference"
                    }
                    onChange={(event) =>
                      updateRequestParam(
                        "full_reference_strategy",
                        event.target.value
                      )
                    }
                  >
                    {FULL_REFERENCE_STRATEGY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {FULL_REFERENCE_STRATEGY_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Open domein
                  <select
                    value={requestParams?.od_strategy ?? "SNAP_ALL_SIDE"}
                    onChange={(event) =>
                      updateRequestParam("od_strategy", event.target.value)
                    }
                  >
                    {OPEN_DOMAIN_STRATEGY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {OPEN_DOMAIN_STRATEGY_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Snap-strategie
                  <select
                    value={requestParams?.snap_strategy ?? "PREFER_VERTICES"}
                    onChange={(event) =>
                      updateRequestParam("snap_strategy", event.target.value)
                    }
                  >
                    {SNAP_STRATEGY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {SNAP_STRATEGY_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Max relevante afstand (m)
                  <input
                    type="number"
                    min={0.1}
                    max={25}
                    step={0.1}
                    value={requestParams?.max_relevant_distance ?? 10}
                    onChange={(event) =>
                      updateRequestParam(
                        "max_relevant_distance",
                        Number(event.target.value)
                      )
                    }
                  />
                </label>

                <label>
                  Processor
                  <select
                    value={requestParams?.processor ?? "AlignerGeometryProcessor"}
                    onChange={(event) =>
                      updateRequestParam("processor", event.target.value)
                    }
                  >
                    {PROCESSOR_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {PROCESSOR_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>

          <div className="alignment-status-row">
            <span className="status-chip">{predictionCount} predictie(s)</span>
            <span className="status-chip">metriek: {metricLabel}</span>
            <span className="status-chip">stap: {stepKey || "-"}</span>
          </div>

          <div className="recalculate-row">
            <button
              type="button"
              className="recalculate-button"
              onClick={() => void calculateForCurrentGeometry()}
              disabled={!canRun}
            >
              {loading ? "Resultaten worden herberekend..." : "Herbereken resultaten"}
            </button>
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="workflow-step-card compact-prediction-card">
          <div className="compact-prediction-header">
            <div>
              <div className="workflow-step-title">Predicties</div>
              <p className="workflow-step-help">
                Klik een voorstel om direct naar die alignering te springen.
              </p>
            </div>
            <div className="compact-step-badge">{stepKey || "-"}</div>
          </div>
          <p className="timeline-help timeline-help-actions">
            Met "Aanpassen" vervang je de huidige input door het geselecteerde BRDR-resultaat.
          </p>

          <div className="compact-prediction-list" role="list">
            {predictionItems.map((item) => (
              <button
                key={item.step}
                type="button"
                className={
                  item.index === stepIndex
                    ? "compact-prediction-item is-active"
                    : "compact-prediction-item"
                }
                onClick={() => setStepIndex(item.index)}
              >
                <span className="compact-prediction-step">{item.step} m</span>
                <span className="compact-prediction-meta">
                  diff {formatDiffValue(item.diff, diffMetric)}
                </span>
                {predictionByStep[item.step] && (
                  <span className="compact-prediction-flag">voorspelling</span>
                )}
                {item.index === stepIndex && (
                  <span className="compact-prediction-current">actief</span>
                )}
                {(predictionByStep[item.step] || item.step === stepKey) && (
                  <span className="compact-prediction-score">
                    betrouwbaarheid{" "}
                    {item.step === stepKey
                      ? currentStepPredictionScore.toFixed(2)
                      : item.score.toFixed(2)}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="compact-actions">
            <button
              type="button"
              className="demo-secondary-button"
              onClick={resetAppliedInputGeometry}
              disabled={!canResetStepGeometry}
            >
              Reset
            </button>
            <button
              type="button"
              className="demo-align-button"
              onClick={handleApplyAlignedGeometry}
              disabled={!canApplyStepGeometry}
            >
              Aanpassen
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
