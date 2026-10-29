import { element, formatNumber, type Point, polylinePath, type SvgElement } from "../../draw/svg.ts";

const HALF_SINE_CONTROL_SHARE = 4 / (3 * Math.PI);
const HALF_SINE_CONTROL_HEIGHT = 4 / 3;
const SAMPLES_PER_GLUON_LOOP = 12;
const GLUON_LOOP_BACK_SHARE = 0.62;
const ARROWHEAD_LENGTH = 9.5;
const ARROWHEAD_HALF_WIDTH_SHARE = 0.42;
const MINIMUM_ARROW_SPACING = 170;
const GAP_FOR_SPACED_ARROW = 3.5;
const GAP_FOR_LONE_ARROW = 2;
const LONE_ARROW_SCALE = 0.8;

interface Gap {
  readonly from: Point;
  readonly to: Point;
  readonly length: number;
}

const normalOf = ([x, y]: Point): Point => [-y, x];

const offset = ([x, y]: Point, along: Point, alongDistance: number, across: Point, acrossDistance: number): Point => [
  x + along[0] * alongDistance + across[0] * acrossDistance,
  y + along[1] * alongDistance + across[1] * acrossDistance,
];

export function photon(from: Point, to: Point, halfWavelength: number, amplitude: number): string | undefined {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (length < halfWavelength * 1.5) return undefined;
  const along: Point = [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
  const across = normalOf(along);
  const halfWaves = Math.max(2, Math.round(length / halfWavelength));
  const halfWave = length / halfWaves;
  const at = (distance: number, height: number) => {
    const [x, y] = offset(from, along, distance, across, height);
    return `${formatNumber(x)},${formatNumber(y)}`;
  };
  const control = HALF_SINE_CONTROL_SHARE * halfWave;
  const curves = Array.from({ length: halfWaves }, (_, wave) => {
    const height = (wave % 2 ? -1 : 1) * amplitude * HALF_SINE_CONTROL_HEIGHT;
    return ` C${at(wave * halfWave + control, height)} ${at((wave + 1) * halfWave - control, height)} ${at((wave + 1) * halfWave, 0)}`;
  });
  return `M${at(0, 0)}${curves.join("")}`;
}

export function gluon(centre: Point, along: Point, length: number, pitch: number): string {
  const loops = Math.max(2, Math.round(length / pitch));
  const rollRadius = length / (2 * Math.PI * loops);
  const loopRadius = (length / loops) * GLUON_LOOP_BACK_SHARE;
  const across = normalOf(along);
  const points = Array.from({ length: loops * SAMPLES_PER_GLUON_LOOP + 1 }, (_, step): Point => {
    const angle = (2 * Math.PI * step) / SAMPLES_PER_GLUON_LOOP;
    const alongDistance = rollRadius * angle - loopRadius * Math.sin(angle) - length / 2;
    const centring = Math.min(1, angle / Math.PI, (2 * Math.PI * loops - angle) / Math.PI);
    const acrossDistance = loopRadius * (1 - Math.cos(angle)) - loopRadius * centring;
    return offset(centre, along, alongDistance, across, acrossDistance);
  });
  return polylinePath(points);
}

function arrowhead(middle: Point, along: Point, size: number): string {
  const across = normalOf(along);
  const halfWidth = size * ARROWHEAD_HALF_WIDTH_SHARE;
  const tip = offset(middle, along, size / 2, across, 0);
  return `${polylinePath([tip, offset(middle, along, -size / 2, across, halfWidth), offset(middle, along, -size / 2, across, -halfWidth)])} Z`;
}

function spacedArrowGaps(gaps: readonly Gap[], size: number, unit: number): Gap[] {
  const chosen: Gap[] = [];
  let lastMiddle = Number.NEGATIVE_INFINITY;
  let travelled = 0;
  for (const gap of gaps) {
    const middle = travelled + gap.length / 2;
    if (gap.length >= size * GAP_FOR_SPACED_ARROW && middle - lastMiddle >= MINIMUM_ARROW_SPACING * unit) {
      chosen.push(gap);
      lastMiddle = middle;
    }
    travelled += gap.length;
  }
  return chosen;
}

export function arrowheads(stops: readonly [Point, Point][], along: Point, colour: string, unit: number): SvgElement[] {
  const size = ARROWHEAD_LENGTH * unit;
  const gaps = stops.map(([from, to]): Gap => ({ from, to, length: Math.hypot(to[0] - from[0], to[1] - from[1]) }));
  const arrow = (gap: Gap, arrowSize: number) =>
    element("path", { d: arrowhead([(gap.from[0] + gap.to[0]) / 2, (gap.from[1] + gap.to[1]) / 2], along, arrowSize), fill: colour });
  const spaced = spacedArrowGaps(gaps, size, unit);
  if (spaced.length > 0) return spaced.map((gap) => arrow(gap, size));
  const longest = gaps.reduce<Gap | undefined>((best, gap) => (!best || gap.length > best.length ? gap : best), undefined);
  return longest && longest.length >= size * GAP_FOR_LONE_ARROW ? [arrow(longest, size * LONE_ARROW_SCALE)] : [];
}
