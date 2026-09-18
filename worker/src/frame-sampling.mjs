export function temporalSamplePlan(duration, requestedCount, coverage = 0.82) {
  const numericDuration = Number(duration);
  const count = Math.max(1, Math.min(5, Math.floor(Number(requestedCount) || 1)));
  if (!Number.isFinite(numericDuration) || numericDuration <= 0)
    return { count, start: 0, interval: null };
  const start = Math.min(0.35, numericDuration / 10);
  if (count === 1) return { count, start, interval: null };
  const available = Math.max(0, numericDuration - start);
  return {
    count,
    start,
    interval: Math.max(0.8, available * coverage / (count - 1)),
  };
}
