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
  return (
    <>
      <div className="workflow-step-card workflow-step-card-recalculate">
        <div className="workflow-step-title">BRDR alignering</div>
        <div className="primary-setting">
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
              OD: {requestParams?.od_strategy ?? "SNAP_ALL_SIDE"} | Snap:{" "}
              {requestParams?.snap_strategy ?? "PREFER_VERTICES"} | Max:{" "}
              {(requestParams?.max_relevant_distance ?? 6).toFixed(1)} m |
              Processor: {requestParams?.processor ?? "AlignerGeometryProcessor"}
            </p>
          )}
          {settingsOpen && (
            <div className="params-grid">
              <label>
                Full reference strategy
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
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Open domain strategy
                <select
                  value={requestParams?.od_strategy ?? "SNAP_ALL_SIDE"}
                  onChange={(event) =>
                    updateRequestParam("od_strategy", event.target.value)
                  }
                >
                  {OPEN_DOMAIN_STRATEGY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Snap strategy
                <select
                  value={requestParams?.snap_strategy ?? "PREFER_VERTICES"}
                  onChange={(event) =>
                    updateRequestParam("snap_strategy", event.target.value)
                  }
                >
                  {SNAP_STRATEGY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
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
                  value={requestParams?.max_relevant_distance ?? 6}
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
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
        <div className="recalculate-row">
          <button
            type="button"
            className="recalculate-button"
            onClick={() => void handleRecalculate()}
            disabled={!canRun}
          >
            {loading ? "Bezig..." : "Herbereken"}
          </button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {currentStep && steps.length > 0 && (
        <Timeline
          stepIndex={stepIndex}
          stepKey={stepKey}
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
