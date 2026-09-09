export function getMaxAbs(values: number[]): number {
  return Math.max(...values.map((v) => Math.abs(v))) || 1;
}

function toVisualValue(value: number): number {
  return Math.sqrt(Math.max(Math.abs(value), 0));
}

export function createXScale(
  count: number,
  width: number,
  padding: number
) {
  return (i: number) =>
    (i / (count - 1)) * (width - padding * 2) + padding;
}

export function createYScale(
  max: number,
  height: number,
  padding: number
) {
  const visualMax = toVisualValue(max || 1);
  return (v: number) =>
    height -
    padding -
    (toVisualValue(v) / visualMax) * (height - padding * 2);
}

export function createLinePoints(
  values: number[],
  getX: (i: number) => number,
  getY: (v: number) => number
) {
  return values.map((v, i) => `${getX(i)},${getY(v)}`).join(" ");
}

export function createAreaPoints(
  values: number[],
  getX: (i: number) => number,
  getY: (v: number) => number,
  height: number,
  padding: number
) {
  return [
    `${padding},${height - padding}`,
    ...values.map((v, i) => `${getX(i)},${getY(v)}`),
    `${getX(values.length - 1)},${height - padding}`,
  ].join(" ");
}
