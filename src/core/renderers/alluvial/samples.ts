import { clamp, smoothstep } from "../../util/maths.ts";

export type Sample = [along: number, across: number, width: number];

export interface Widening {
  readonly from: number;
  readonly to: number;
  readonly startWidth: number;
  readonly endWidth: number;
}

const FEWEST_CURVE_SAMPLES = 8;
const MOST_CURVE_SAMPLES = 240;
const CURVE_LENGTH_ALLOWANCE = 1.2;
const SAMPLES_PER_WIDENING = 6;

export const easedShare = (position: number, start: number, end: number): number => (end > start ? smoothstep((position - start) / (end - start)) : 1);

export function curve(start: Sample, end: Sample, spacing: number): Sample[] {
  const [startAlong, startAcross, startWidth] = start;
  const [endAlong, endAcross, endWidth] = end;
  if (startAcross === endAcross && startWidth === endWidth) return [start, end];
  const length = CURVE_LENGTH_ALLOWANCE * Math.hypot(endAlong - startAlong, endAcross - startAcross);
  const count = clamp(Math.ceil(length / spacing), FEWEST_CURVE_SAMPLES, MOST_CURVE_SAMPLES);
  return Array.from({ length: count + 1 }, (_, index): Sample => {
    const eased = smoothstep(index / count);
    return [
      startAlong + (endAlong - startAlong) * (index / count),
      startAcross + (endAcross - startAcross) * eased,
      startWidth + (endWidth - startWidth) * eased,
    ];
  });
}

function widthAt(along: number, widenings: readonly Widening[], initialWidth: number): number {
  let width = initialWidth;
  for (const widening of widenings) {
    if (along >= widening.to) width = widening.endWidth;
    else if (along > widening.from) {
      return widening.startWidth + (widening.endWidth - widening.startWidth) * smoothstep((along - widening.from) / (widening.to - widening.from));
    } else break;
  }
  return width;
}

const wideningSamples = (widenings: readonly Widening[]): number[] =>
  widenings.flatMap((widening) =>
    widening.to > widening.from && widening.endWidth !== widening.startWidth
      ? Array.from({ length: SAMPLES_PER_WIDENING + 1 }, (_, index) => widening.from + ((widening.to - widening.from) * index) / SAMPLES_PER_WIDENING)
      : [],
  );

export function widen(line: readonly Sample[], widenings: readonly Widening[], initialWidth: number): Sample[] {
  const extra = wideningSamples(widenings);
  const centreline: [along: number, across: number][] = [];
  let next = 0;
  line.forEach(([along, across], index) => {
    const previous = line[index - 1];
    for (; next < extra.length && extra[next] < along; next++) {
      if (previous && extra[next] > previous[0]) {
        centreline.push([extra[next], previous[1] + ((across - previous[1]) * (extra[next] - previous[0])) / (along - previous[0])]);
      }
    }
    centreline.push([along, across]);
  });
  return centreline.map(([along, across]) => [along, across, widthAt(along, widenings, initialWidth)]);
}

export function subdivide(samples: readonly Sample[], spacing: number): Sample[] {
  const first = samples[0];
  if (!first) return [];
  const result: Sample[] = [first];
  for (let index = 1; index < samples.length; index++) {
    const [startAlong, startAcross, startWidth] = samples[index - 1];
    const [endAlong, endAcross, endWidth] = samples[index];
    const count = Math.max(1, Math.ceil(Math.abs(endAlong - startAlong) / spacing));
    for (let step = 1; step <= count; step++) {
      const along = startAlong + ((endAlong - startAlong) * step) / count;
      result.push([along, startAcross + ((endAcross - startAcross) * step) / count, startWidth + ((endWidth - startWidth) * step) / count]);
    }
  }
  return result;
}
