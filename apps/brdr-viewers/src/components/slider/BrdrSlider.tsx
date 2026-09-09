import "./BrdrSlider.css";

interface Props {
  value: number;
  max: number;
  predictionFlags: boolean[];
  onChange: (value: number) => void;
}

export function BrdrSlider({ value, max, predictionFlags, onChange }: Props) {
  const predictionIndexes = predictionFlags
    .map((isPrediction, index) => (isPrediction ? index : -1))
    .filter((index) => index >= 0);

  function markerLeft(index: number): string {
    if (max <= 0) return "0%";
    return `${(index / max) * 100}%`;
  }

  return (
    <div className="brdr-slider-wrap">
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="brdr-slider"
      />
      <div className="brdr-slider-markers" aria-hidden="true">
        {predictionIndexes.map((index) => (
          <span
            key={index}
            className="brdr-slider-marker"
            style={{ left: markerLeft(index) }}
          />
        ))}
      </div>
    </div>
  );
}
