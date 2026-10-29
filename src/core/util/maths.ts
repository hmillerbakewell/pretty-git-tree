export const clamp = (value: number, lowest: number, highest: number): number => Math.max(lowest, Math.min(highest, value));

const LARGEST_TIME_STEP = 1;

export function smallestGapBetweenTimes(values: Iterable<number>): number {
  const distinct = [...new Set(values)].sort((a, b) => a - b);
  let step = LARGEST_TIME_STEP;
  for (let index = 1; index < distinct.length; index++) step = Math.min(step, distinct[index] - distinct[index - 1]);
  return step;
}

export const smoothstep = (progress: number): number => (progress <= 0 ? 0 : progress >= 1 ? 1 : progress * progress * (3 - 2 * progress));
