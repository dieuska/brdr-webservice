import { DistanceTimeline } from "./DistanceTimeline";
import "./Timeline.css";

interface Props {
  stepIndex: number;
  stepKey: string;
  diffMetric: "area" | "length" | "count";
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
  diffMetric,
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
  const predictionCount = predictionStepKeys.length;
  const currentDiffValue = values[stepIndex] ?? 0;
  const metricLabel =
    diffMetric === "area" ? "oppervlakte" : diffMetric === "length" ? "lengte" : "aantal";

  return (
    <div className="timeline">
      <div className="timeline-inner">
        <div className="workflow-title">Stap 2. Kies een BRDR-voorstel</div>
        <p className="timeline-help">
          Navigeer tussen de stappen of spring rechtstreeks naar een predictie, en pas daarna de gekozen geometrie toe.
        </p>
        <div className="timeline-summary">
          <div className="timeline-summary-card">
            <span className="timeline-summary-label">Actieve stap</span>
            <strong>{stepKey} m</strong>
          </div>
          <div className="timeline-summary-card">
            <span className="timeline-summary-label">Predicties</span>
            <strong>{predictionCount}</strong>
          </div>
          <div className="timeline-summary-card">
            <span className="timeline-summary-label">Diff {metricLabel}</span>
            <strong>{currentDiffValue.toFixed(diffMetric === "count" ? 0 : 2)}</strong>
          </div>
        </div>
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
            <span>Geselecteerde afstand</span>
            <span>
              {stepKey} m
              {isPredictionStep && (
                <strong className="prediction-badge">voorspelling</strong>
              )}
            </span>
          </div>
          <div className="prediction-score-row">
            <span>Betrouwbaarheid</span>
            <strong>{currentPredictionScore.toFixed(3)}</strong>
          </div>
        </div>

        <div className="prediction-nav">
          <button
            type="button"
            onClick={onPreviousPrediction}
            disabled={!hasPreviousPrediction}
            aria-label="Ga naar de vorige predictie"
          >
            Vorige predictie
          </button>
          <button
            type="button"
            onClick={onNextPrediction}
            disabled={!hasNextPrediction}
            aria-label="Ga naar de volgende predictie"
          >
            Volgende predictie
          </button>
        </div>

        <div className="prediction-steps">
          <span>Beschikbare predicties:</span>
          <span>
            {predictionStepKeys.length > 0
              ? predictionStepKeys.map((step) => `${step} m`).join(", ")
              : "geen"}
          </span>
        </div>

        <p className="timeline-help timeline-help-actions">
          Met "Aanpassen" vervang je de huidige input door het geselecteerde BRDR-resultaat.
        </p>
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
