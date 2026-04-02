import "./BrdrSlider.css";

interface Props {
  value: number;
  max: number;
  onChange: (value: number) => void;
}

export function BrdrSlider({ value, max, onChange }: Props) {
  return (
    <input
      type="range"
      min={0}
      max={max}
      step={1}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
            className="brdr-slider"  
    />
  );
}
