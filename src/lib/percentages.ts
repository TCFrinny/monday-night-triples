/** Exact primary ranking value; never round before sorting or cutoff ties. */
export function percentage(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

/** All user-facing percentages have two decimal places. */
export function formatPercentValue(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function formatPercent(part: number, whole: number): string {
  return formatPercentValue(percentage(part, whole));
}