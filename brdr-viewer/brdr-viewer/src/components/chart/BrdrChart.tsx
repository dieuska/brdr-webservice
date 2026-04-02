import {
  getMaxAbs,
  createXScale,
  createYScale,
  createLinePoints,
  createAreaPoints,
} from "./brdrChartUtils";
import "./BrdrChart.css";

interface Props {
  values: number[];
  activeIndex: number;
  predictionFlags: boolean[];
}

const VIEWBOX_WIDTH = 150;
const VIEWBOX_HEIGHT = 80;
const PADDING = 3;

export function BrdrChart({
  values,
  activeIndex,
  predictionFlags,
}: Props) {
  const max = getMaxAbs(values);

  const getX = createXScale(
    values.length,
    VIEWBOX_WIDTH,
    PADDING
  );
  const getY = createYScale(
    max,
    VIEWBOX_HEIGHT,
    PADDING
  );

  const linePoints = createLinePoints(values, getX, getY);
  const areaPoints = createAreaPoints(
    values,
    getX,
    getY,
    VIEWBOX_HEIGHT,
    PADDING
  );

  const activeValue = values[activeIndex];
  const activeX = getX(activeIndex);
  const activeY = getY(activeValue);

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      className="brdr-chart"
    >
      <polygon
        points={areaPoints}
        fill="rgba(221,48,48,0.08)"
      />

      <polyline
        points={linePoints}
        fill="none"
        stroke="#608bcf"
        strokeWidth={1.5}
      />

      {values.map((v, i) => (
        <circle
          key={i}
          cx={getX(i)}
          cy={getY(v)}
          r={i === activeIndex ? 2 : 1}
          fill={
            i === activeIndex
              ? predictionFlags[i]
                ? "#d97706"
                : "#ff0000"
              : predictionFlags[i]
                ? "#f59e0b"
                : "#000000"
          }
        />
      ))}

      <text
        x={activeX}
        y={activeY - 6}
        textAnchor="middle"
        fontSize={5}
        fill="#111827"
      >
        {activeValue.toFixed(1)} m²
      </text>
    </svg>
  );
}
