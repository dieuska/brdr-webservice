import { useEffect, useMemo, useRef, useState } from "react";
import MapView from "../map/MapView";
import type { Geometry } from "../../types/brdr";
import { useBrdrState } from "../../state/useBrdrState";
import { BrdrAlignPanel } from "./BrdrAlignPanel";
import { assertSupportedCrs, type BrdrSupportedCrs } from "./contracts";

export interface BrdrAlignmentViewerProps {
  crs: BrdrSupportedCrs;
  inputGeometry: Geometry;
  onApplyAlignedGeometry?: (geometry: Geometry) => void;
  onLoadingChange?: (loading: boolean) => void;
  onErrorChange?: (message: string | null) => void;
}

function geometrySignature(geometry: Geometry | null): string {
  if (!geometry) return "null";
  return JSON.stringify(geometry);
}

export function BrdrAlignmentViewer({
  crs,
  inputGeometry: externalInputGeometry,
  onApplyAlignedGeometry,
  onLoadingChange,
  onErrorChange,
}: BrdrAlignmentViewerProps) {
  assertSupportedCrs(crs);

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
  } = useBrdrState({
    crs,
    initialGeometry: externalInputGeometry,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const lastExternalGeometryRef = useRef<string>(
    geometrySignature(externalInputGeometry)
  );

  const canRun = Boolean(inputGeometry) && !loading;
  const canApplyStepGeometry = Boolean(currentStep) && !loading;
  const canResetStepGeometry = hasAppliedInputGeometry && !loading;
  const predictionIndexes = useMemo(
    () =>
      steps
        .map((step, index) => ((predictionByStep[step] ?? false) ? index : -1))
        .filter((index) => index >= 0),
    [predictionByStep, steps]
  );

  const previousPredictionIndex = [...predictionIndexes]
    .reverse()
    .find((index) => index < stepIndex);
  const nextPredictionIndex = predictionIndexes.find((index) => index > stepIndex);

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

  function goToPreviousPrediction() {
    if (previousPredictionIndex === undefined) return;
    setStepIndex(previousPredictionIndex);
  }

  function goToNextPrediction() {
    if (nextPredictionIndex === undefined) return;
    setStepIndex(nextPredictionIndex);
  }

  async function handleRecalculate() {
    await calculateForCurrentGeometry();
  }

  function handleApplyAlignedGeometry() {
    if (!currentStep) return;
    const alignedGeometry = structuredClone(currentStep.result);
    applyCurrentStepToInputGeometry();
    onApplyAlignedGeometry?.(alignedGeometry);
  }

  return (
    <div className="app-layout">
      <div className="map-wrapper">
        <MapView
          crs={crs}
          step={currentStep}
          selectedGrbTypes={
            requestParams?.grb_type ? [requestParams.grb_type] : undefined
          }
          showDiffLayers={!hasAppliedInputGeometry}
          suspendBrdrLayers={loading}
          loading={loading}
          inputGeometry={inputGeometry}
          onInputGeometryChange={updateInputGeometry}
          drawEnabled={false}
          allowGeometryEditing={false}
        />
      </div>

      <aside className="side-panel">
        <div className="input-controls">
          <BrdrAlignPanel
            requestParams={requestParams}
            settingsOpen={settingsOpen}
            setSettingsOpen={setSettingsOpen}
            canRun={canRun}
            loading={loading}
            error={error}
            steps={steps}
            values={values}
            predictionByStep={predictionByStep}
            currentStep={currentStep}
            stepKey={stepKey}
            stepIndex={stepIndex}
            currentStepPredictionScore={currentStepPredictionScore}
            currentStepIsPrediction={currentStepIsPrediction}
            canApplyStepGeometry={canApplyStepGeometry}
            canResetStepGeometry={canResetStepGeometry}
            previousPredictionIndex={previousPredictionIndex}
            nextPredictionIndex={nextPredictionIndex}
            updateRequestParam={updateRequestParam}
            handleRecalculate={handleRecalculate}
            goToPreviousPrediction={goToPreviousPrediction}
            goToNextPrediction={goToNextPrediction}
            applyCurrentStepToInputGeometry={handleApplyAlignedGeometry}
            resetAppliedInputGeometry={resetAppliedInputGeometry}
            setStepIndex={setStepIndex}
          />
        </div>
      </aside>
    </div>
  );
}
