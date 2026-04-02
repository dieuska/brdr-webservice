import { BrdrChart } from "../chart/BrdrChart";
import { BrdrSlider } from "../slider/BrdrSlider";
import "./Timeline.css";

interface Props {
  stepIndex: number;
  stepKey: string;
  isPredictionStep: boolean;
  currentPredictionScore: number;
  stepsCount: number;
  values: number[];
  predictionFlags: boolean[];
  predictionStepKeys: string[];
  onStepChange: (index: number) => void;
  onPreviousPrediction: () => void;
  onNextPrediction: () => void;
  hasPreviousPrediction: boolean;
  hasNextPrediction: boolean;
}

export function Timeline({
  stepIndex,
  stepKey,
  isPredictionStep,
  currentPredictionScore,
  stepsCount,
  values,
  predictionFlags,
  predictionStepKeys,
  onStepChange,
  onPreviousPrediction,
  onNextPrediction,
  hasPreviousPrediction,
  hasNextPrediction,
}: Props) {
  return (
    <div className="timeline">
      <div className="timeline-inner">
        <BrdrChart
          values={values}
          activeIndex={stepIndex}
          predictionFlags={predictionFlags}
        />

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

          <BrdrSlider
            value={stepIndex}
            max={stepsCount - 1}
            onChange={onStepChange}
          />
        </div>
        <div className="prediction-nav">
          <button
            type="button"
            onClick={onPreviousPrediction}
            disabled={!hasPreviousPrediction}
            aria-label="Go to previous prediction step"
          >
            ← Previous prediction
          </button>
          <button
            type="button"
            onClick={onNextPrediction}
            disabled={!hasNextPrediction}
            aria-label="Go to next prediction step"
          >
            Next prediction →
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
      </div>
    </div>
  );
}
