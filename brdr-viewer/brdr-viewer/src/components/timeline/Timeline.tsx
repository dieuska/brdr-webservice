import { DistanceTimeline } from "./DistanceTimeline";
import "./Timeline.css";

interface Props {
  stepIndex: number;
  stepKey: string;
  isPredictionStep: boolean;
  currentPredictionScore: number;
  values: number[];
  predictionFlags: boolean[];
  predictionStepKeys: string[];
  onStepChange: (index: number) => void;
  onPreviousPrediction: () => void;
  onNextPrediction: () => void;
  hasPreviousPrediction: boolean;
  hasNextPrediction: boolean;
  onApply: () => void;
  onReset: () => void;
  canApply: boolean;
  canReset: boolean;
}

export function Timeline({
  stepIndex,
  stepKey,
  isPredictionStep,
  currentPredictionScore,
  values,
  predictionFlags,
  predictionStepKeys,
  onStepChange,
  onPreviousPrediction,
  onNextPrediction,
  hasPreviousPrediction,
  hasNextPrediction,
  onApply,
  onReset,
  canApply,
  canReset,
}: Props) {
  return (
    <div className="timeline">
      <div className="timeline-inner">
        <div className="workflow-title">Stap 3. Aanpassen op basis van predicties</div>
        <div className="chart-section">
          <div className="chart-frame">
            <DistanceTimeline
              values={values}
              predictionFlags={predictionFlags}
              activeIndex={stepIndex}
              onStepChange={onStepChange}
            />
          </div>
        </div>

        <div className="slider-wrapper">
          <div className="slider-labels">
            <span>Stap</span>
            <span>
              {stepKey}
              {isPredictionStep && (
                <strong className="prediction-badge">prediction</strong>
              )}
            </span>
          </div>
          <div className="prediction-score-row">
            <span>Prediction score</span>
            <strong>{currentPredictionScore.toFixed(3)}</strong>
          </div>
        </div>

        <div className="prediction-nav">
          <button
            type="button"
            onClick={onPreviousPrediction}
            disabled={!hasPreviousPrediction}
            aria-label="Go to previous prediction step"
          >
            {"<"} Previous prediction
          </button>
          <button
            type="button"
            onClick={onNextPrediction}
            disabled={!hasNextPrediction}
            aria-label="Go to next prediction step"
          >
            Next prediction {">"}
          </button>
        </div>

        <div className="prediction-steps">
          <span>Prediction steps:</span>
          <span>
            {predictionStepKeys.length > 0
              ? predictionStepKeys.join(", ")
              : "none"}
          </span>
        </div>

        <div className="apply-actions">
          <button type="button" onClick={onApply} disabled={!canApply}>
            Aanpassen
          </button>
          <button type="button" onClick={onReset} disabled={!canReset}>
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
