import { useCallback, useEffect, useMemo, useRef } from "react";
import "./DistanceTimeline.css";

interface Props {
  values: number[];
  predictionFlags: boolean[];
  activeIndex: number;
  onStepChange: (index: number) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getMaxAbs(values: number[]): number {
  return Math.max(...values.map((v) => Math.abs(v))) || 1;
}

export function DistanceTimeline({
  values,
  predictionFlags,
  activeIndex,
  onStepChange,
}: Props) {
  const railRef = useRef<HTMLDivElement>(null);
  const moveHandlerRef = useRef<((event: PointerEvent) => void) | null>(null);

  const count = values.length;
  const maxIndex = Math.max(count - 1, 0);
  const maxAbs = getMaxAbs(values);

  const xPercent = useCallback(
    (index: number): number => (maxIndex === 0 ? 0 : (index / maxIndex) * 100),
    [maxIndex]
  );

  const yPercent = useCallback(
    (value: number): number => {
      const top = 8;
      const bottom = 92;
      return bottom - (Math.abs(value) / maxAbs) * (bottom - top);
    },
    [maxAbs]
  );

  const linePoints = useMemo(
    () => values.map((v, i) => `${xPercent(i)},${yPercent(v)}`).join(" "),
    [values, xPercent, yPercent]
  );

  const areaPoints = useMemo(() => {
    if (values.length === 0) {
      return "";
    }
    return [
      `0,92`,
      ...values.map((v, i) => `${xPercent(i)},${yPercent(v)}`),
      `100,92`,
    ].join(" ");
  }, [values, xPercent, yPercent]);

  const activeLeft = xPercent(activeIndex);
  const predictionIndexes = predictionFlags
    .map((isPrediction, index) => (isPrediction ? index : -1))
    .filter((index) => index >= 0);

  const setIndexFromClientX = useCallback(
    (clientX: number) => {
      if (!railRef.current || maxIndex === 0) {
        onStepChange(0);
        return;
      }
      const rect = railRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      onStepChange(Math.round(ratio * maxIndex));
    },
    [maxIndex, onStepChange]
  );

  const stopDrag = useCallback(() => {
    if (moveHandlerRef.current) {
      window.removeEventListener("pointermove", moveHandlerRef.current);
      moveHandlerRef.current = null;
    }
  }, []);

  const startDrag = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      setIndexFromClientX(event.clientX);

      const onMove = (moveEvent: PointerEvent) => {
        setIndexFromClientX(moveEvent.clientX);
      };
      moveHandlerRef.current = onMove;
      window.addEventListener("pointermove", onMove);
      window.addEventListener(
        "pointerup",
        () => {
          stopDrag();
        },
        { once: true }
      );
    },
    [setIndexFromClientX, stopDrag]
  );

  useEffect(() => stopDrag, [stopDrag]);

  return (
    <div className="distance-timeline">
      <div className="distance-chart">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon points={areaPoints} className="distance-area" />
          <polyline points={linePoints} className="distance-line" />
          {values.map((value, index) => (
            <circle
              key={index}
              cx={xPercent(index)}
              cy={yPercent(value)}
              r={index === activeIndex ? 1.9 : 1.2}
              className={
                predictionFlags[index]
                  ? index === activeIndex
                    ? "distance-point prediction active"
                    : "distance-point prediction"
                  : index === activeIndex
                    ? "distance-point active"
                    : "distance-point"
              }
            />
          ))}
        </svg>
      </div>

      <div className="distance-rail-wrap">
        <div
          ref={railRef}
          className="distance-rail"
          onPointerDown={startDrag}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={maxIndex}
          aria-valuenow={activeIndex}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              onStepChange(clamp(activeIndex - 1, 0, maxIndex));
            } else if (event.key === "ArrowRight") {
              onStepChange(clamp(activeIndex + 1, 0, maxIndex));
            }
          }}
        >
          <div className="distance-rail-track" />
          <div
            className="distance-rail-progress"
            style={{ width: `${activeLeft}%` }}
          />

          {predictionIndexes.map((index) => (
            <button
              key={index}
              type="button"
              className="distance-prediction-ring"
              style={{ left: `${xPercent(index)}%` }}
              onClick={() => onStepChange(index)}
              aria-label={`Ga naar prediction stap ${index + 1}`}
            />
          ))}

          <div className="distance-thumb" style={{ left: `${activeLeft}%` }} />
        </div>
      </div>
    </div>
  );
}
