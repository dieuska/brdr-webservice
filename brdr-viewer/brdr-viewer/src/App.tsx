import { useState } from "react";
import MapView from "./components/map/MapView";
import type { DrawGeometryType } from "./components/map/MapView";
import { Timeline } from "./components/timeline/Timeline";
import { useBrdrState } from "./state/useBrdrState";
import "./App.css";
import "ol/ol.css";

const GRB_TYPE_OPTIONS = [
  "GRB - ADP - administratief perceel",
  "GRB - ANO - anomalie",
  "GRB - Adres - adres",
  "GRB - AdresLabel - adreslabel",
  "GRB - GBA - gebouwaanhorigheid",
  "GRB - GBG - gebouw aan de grond",
  "GRB - GVL - gevellijn",
  "GRB - GVP - gevelpunt",
  "GRB - IngeschetstGebouw - ingeschetst gebouw",
  "GRB - KNW - kunstwerk",
  "GRB - LBZ - lokale bijhoudingszone",
  "GRB - SBN - spoorbaan",
  "GRB - SGBG - samengesteld gebouw",
  "GRB - TRN - terrein",
  "GRB - WBN - wegbaan",
  "GRB - WGA - wegaanhorigheid",
  "GRB - WGO - wegopdeling",
  "GRB - WGR - gracht",
  "GRB - WLAS - VHA-waterloopsegment",
  "GRB - WLI - longitudinale weginrichting",
  "GRB - WPI - puntvormige inrichting",
  "GRB - WRI - putdeksel",
  "GRB - WRL - spoorrail",
  "GRB - WTI - transversale weginrichting",
  "GRB - WTZ - watergang",
  "GRB - Wegknoop - wegknoop",
  "GRB - Wegsegment - wegsegment",
];

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

const DRAW_TYPE_OPTIONS: Array<{
  value: DrawGeometryType;
  label: string;
  icon: string;
}> = [
  { value: "Point", label: "Punt", icon: "●" },
  { value: "LineString", label: "Lijn", icon: "／" },
  { value: "Polygon", label: "Polygoon", icon: "▱" },
];

function App() {
  const {
    steps,
    values,
    currentStep,
    stepKey,
    stepIndex,
    predictionByStep,
    currentStepPredictionScore,
    currentStepIsPrediction,
    loading,
    error,
    requestParams,
    updateRequestParam,
    inputGeometry,
    updateInputGeometry,
    calculateForCurrentGeometry,
    calculateForInputGeometry,
    applyCurrentStepToInputGeometry,
    resetAppliedInputGeometry,
    hasAppliedInputGeometry,
    setStepIndex,
  } = useBrdrState();
  const [drawRequestToken, setDrawRequestToken] = useState(0);
  const [drawGeometryType, setDrawGeometryType] =
    useState<DrawGeometryType>("Polygon");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const canRun = Boolean(inputGeometry) && !loading;
  const canApplyStepGeometry = Boolean(currentStep) && !loading;
  const canResetStepGeometry = hasAppliedInputGeometry && !loading;
  const drawHint =
    drawGeometryType === "Point"
      ? "Punt: klik 1x op de kaart."
      : drawGeometryType === "LineString"
        ? "Lijn: klik meerdere punten, dubbelklik om te stoppen."
        : "Polygoon: klik punten, dubbelklik om te sluiten.";
  const predictionIndexes = steps
    .map((step, index) => ((predictionByStep[step] ?? false) ? index : -1))
    .filter((index) => index >= 0);

  const previousPredictionIndex = [...predictionIndexes]
    .reverse()
    .find((index) => index < stepIndex);
  const nextPredictionIndex = predictionIndexes.find((index) => index > stepIndex);

  function goToPreviousPrediction() {
    if (previousPredictionIndex === undefined) return;
    setStepIndex(previousPredictionIndex);
  }

  function goToNextPrediction() {
    if (nextPredictionIndex === undefined) return;
    setStepIndex(nextPredictionIndex);
  }

  async function handleInputGeometryChange(
    geometry: Parameters<typeof updateInputGeometry>[0]
  ) {
    updateInputGeometry(geometry);
    await calculateForInputGeometry(geometry);
  }

  async function handleRecalculate() {
    await calculateForCurrentGeometry();
  }

  return (
    <div className="app-layout">
      <div className="map-wrapper">
        <MapView
          step={currentStep}
          selectedGrbType={requestParams?.grb_type}
          showDiffLayers={!hasAppliedInputGeometry}
          suspendBrdrLayers={loading}
          loading={loading}
          inputGeometry={inputGeometry}
          onInputGeometryChange={handleInputGeometryChange}
          drawRequestToken={drawRequestToken}
          drawGeometryType={drawGeometryType}
          drawHint={drawHint}
        />
      </div>

      <aside className="side-panel">
        <div className="input-controls">
          <h3>Workflow</h3>
          <div className="workflow-step-card">
            <div className="workflow-step-title">Stap 1. Intekenen</div>
            <p className="workflow-step-help">
              Klik op Punt, Lijn of Polygoon en teken direct op de kaart.
            </p>
            <div className="input-controls-actions">
              <div className="draw-type-picker" aria-label="Tekentype">
                {DRAW_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="draw-type-button"
                    aria-pressed={drawGeometryType === option.value}
                    onClick={() => {
                      setDrawGeometryType(option.value);
                      setDrawRequestToken((v) => v + 1);
                    }}
                    title={option.label}
                  >
                    <span className="draw-type-icon" aria-hidden="true">
                      {option.icon}
                    </span>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="workflow-step-card workflow-step-card-recalculate">
            <div className="workflow-step-title">Stap 2. Herberekenen</div>
            <div className="primary-setting">
              <label>
                Kies GRB-referentielaag
                <select
                  value={requestParams?.grb_type ?? "GRB - ADP - administratief perceel"}
                  onChange={(event) =>
                    updateRequestParam("grb_type", event.target.value)
                  }
                >
                  {GRB_TYPE_OPTIONS.map((option) => (
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
                onClick={() => setSettingsOpen((v) => !v)}
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
                  Processor:{" "}
                  {requestParams?.processor ?? "AlignerGeometryProcessor"}
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
        </div>

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
      </aside>
    </div>
  );
}

export default App;
