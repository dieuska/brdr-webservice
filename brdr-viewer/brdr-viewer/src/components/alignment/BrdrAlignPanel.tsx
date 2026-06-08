import { Timeline } from "../timeline/Timeline";
import type { BrdrStep } from "../../types/brdr";
import type { BrdrRequestBody } from "../../types/brdr";
import { GRB_REFERENCE_LAYER_OPTIONS } from "../../data/grbReferenceLayerOptions";

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
interface Props {
  requestParams: BrdrRequestBody["params"] | undefined;
  settingsOpen: boolean;
  setSettingsOpen: (next: boolean) => void;
  canRun: boolean;
  loading: boolean;
  error: string | null;
  steps: string[];
  values: number[];
  predictionByStep: Record<string, boolean>;
  diffMetric: "area" | "length" | "count";
  currentStep: BrdrStep | null;
  stepKey: string;
  stepIndex: number;
  currentStepPredictionScore: number;
  currentStepIsPrediction: boolean;
  canApplyStepGeometry: boolean;
  canResetStepGeometry: boolean;
  previousPredictionIndex: number | undefined;
  nextPredictionIndex: number | undefined;
  updateRequestParam: (
    key:
      | "crs"
      | "grb_type"
      | "full_reference_strategy"
      | "od_strategy"
      | "snap_strategy"
      | "max_relevant_distance"
      | "processor",
    value: string | number
  ) => void;
  handleRecalculate: () => Promise<void>;
  goToPreviousPrediction: () => void;
  goToNextPrediction: () => void;
  applyCurrentStepToInputGeometry: () => void;
  resetAppliedInputGeometry: () => void;
  setStepIndex: (index: number) => void;
}

export function BrdrAlignPanel({
  requestParams,
  settingsOpen,
  setSettingsOpen,
  canRun,
  loading,
  error,
  steps,
  values,
  predictionByStep,
  diffMetric,
  currentStep,
  stepKey,
  stepIndex,
  currentStepPredictionScore,
  currentStepIsPrediction,
  canApplyStepGeometry,
  canResetStepGeometry,
  previousPredictionIndex,
  nextPredictionIndex,
  updateRequestParam,
  handleRecalculate,
  goToPreviousPrediction,
  goToNextPrediction,
  applyCurrentStepToInputGeometry,
  resetAppliedInputGeometry,
  setStepIndex,
}: Props) {
  const isWfsReference = requestParams?.reference_loader === "wfs";
  const predictionCount = steps.filter((step) => predictionByStep[step] ?? false).length;
  const metricLabel =
    diffMetric === "area" ? "oppervlakte" : diffMetric === "length" ? "lengte" : "aantal";

  return (
    <>
      <div className="workflow-step-card workflow-step-card-recalculate">
        <div className="workflow-step-title">Stap 1. Instellingen en herberekening</div>
        <p className="workflow-step-help">
          Kies de referentie en herbereken de BRDR-resultaten voor de huidige geometrie.
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
              {(requestParams?.max_relevant_distance ?? 10).toFixed(1)} m |
              Processor: {PROCESSOR_LABELS[requestParams?.processor ?? "AlignerGeometryProcessor"]}
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
          <span className="status-chip">
            max afstand: {(requestParams?.max_relevant_distance ?? 10).toFixed(1)} m
          </span>
        </div>
        <div className="recalculate-row">
          <button
            type="button"
            className="recalculate-button"
            onClick={() => void handleRecalculate()}
            disabled={!canRun}
          >
            {loading ? "Resultaten worden herberekend..." : "Herbereken resultaten"}
          </button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {currentStep && steps.length > 0 && (
        <Timeline
          stepIndex={stepIndex}
          stepKey={stepKey}
          diffMetric={diffMetric}
          isPredictionStep={currentStepIsPrediction}
          currentPredictionScore={currentStepPredictionScore}
          values={values}
          predictionFlags={steps.map((k) => predictionByStep[k] ?? false)}
          predictionStepKeys={steps.filter((k) => predictionByStep[k] ?? false)}
          onPreviousPrediction={goToPreviousPrediction}
          onNextPrediction={goToNextPrediction}
          hasPreviousPrediction={previousPredictionIndex !== undefined}
          hasNextPrediction={nextPredictionIndex !== undefined}
          onApply={applyCurrentStepToInputGeometry}
          onReset={resetAppliedInputGeometry}
          canApply={canApplyStepGeometry}
          canReset={canResetStepGeometry}
          onStepChange={setStepIndex}
        />
      )}
    </>
  );
}
