import { useState } from "react";
import MapView from "./components/map/MapView";
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
    setStepIndex,
  } = useBrdrState();
  const [drawRequestToken, setDrawRequestToken] = useState(0);

  const canRun = Boolean(inputGeometry) && !loading;
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

  return (
    <div className="app-layout">
      <div className="map-wrapper">
        <MapView
          step={currentStep}
          inputGeometry={inputGeometry}
          onInputGeometryChange={updateInputGeometry}
          drawRequestToken={drawRequestToken}
        />
      </div>

      <aside className="side-panel">
        <div className="input-controls">
          <h3>Input geometrie</h3>
          <p>
            Teken of pas een geometrie aan op de kaart en klik daarna op
            herbereken.
          </p>
          <div className="input-controls-actions">
            <button
              type="button"
              onClick={() => setDrawRequestToken((v) => v + 1)}
            >
              Teken nieuwe geometrie
            </button>
            <button
              type="button"
              onClick={() => void calculateForCurrentGeometry()}
              disabled={!canRun}
            >
              {loading ? "Bezig..." : "Herbereken"}
            </button>
          </div>
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
            <label className="params-grid-full">
              GRB type
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
          {error && <p className="error-text">{error}</p>}
        </div>

        {currentStep && steps.length > 0 && (
          <Timeline
            stepIndex={stepIndex}
            stepKey={stepKey}
            isPredictionStep={currentStepIsPrediction}
            currentPredictionScore={currentStepPredictionScore}
            stepsCount={steps.length}
            values={values}
            predictionFlags={steps.map((k) => predictionByStep[k] ?? false)}
            predictionStepKeys={steps.filter((k) => predictionByStep[k] ?? false)}
            onPreviousPrediction={goToPreviousPrediction}
            onNextPrediction={goToNextPrediction}
            hasPreviousPrediction={previousPredictionIndex !== undefined}
            hasNextPrediction={nextPredictionIndex !== undefined}
            onStepChange={setStepIndex}
          />
        )}
      </aside>
    </div>
  );
}

export default App;
