import { useState } from "react";
import MapView from "./components/map/MapView";
import { Timeline } from "./components/timeline/Timeline";
import { useBrdrState } from "./state/useBrdrState";
import "./App.css";
import "ol/ol.css";

function App() {
  const {
    steps,
    values,
    currentStep,
    stepKey,
    stepIndex,
    loading,
    error,
    inputGeometry,
    updateInputGeometry,
    calculateForCurrentGeometry,
    setStepIndex,
  } = useBrdrState();
  const [drawRequestToken, setDrawRequestToken] = useState(0);

  const canRun = Boolean(inputGeometry) && !loading;

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
          {error && <p className="error-text">{error}</p>}
        </div>

        {currentStep && steps.length > 0 && (
          <Timeline
            stepIndex={stepIndex}
            stepKey={stepKey}
            stepsCount={steps.length}
            values={values}
            onStepChange={setStepIndex}
          />
        )}
      </aside>
    </div>
  );
}

export default App;
