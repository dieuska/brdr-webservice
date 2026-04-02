import { BrdrChart } from "../chart/BrdrChart";
import { BrdrSlider } from "../slider/BrdrSlider";
import "./Timeline.css";

interface Props {
  stepIndex: number;
  stepKey: string;
  stepsCount: number;
  values: number[];
  onStepChange: (index: number) => void;
}

export function Timeline({
  stepIndex,
  stepKey,
  stepsCount,
  values,
  onStepChange,
}: Props) {
  return (
    <div className="timeline">
      <div className="timeline-inner">
        <BrdrChart
          values={values}
          activeIndex={stepIndex}
        />

        <div className="slider-wrapper">
          <div className="slider-labels">
            <span>Stap</span>
            <span>{stepKey}</span>
          </div>

          <BrdrSlider
            value={stepIndex}
            max={stepsCount - 1}
            onChange={onStepChange}
          />
        </div>
      </div>
    </div>
  );
}
