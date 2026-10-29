import { mix } from "../../draw/colour.ts";
import type { Frame } from "../../draw/frame.ts";
import type { Point } from "../../draw/svg.ts";
import type { Theme } from "../../draw/themes.ts";
import type { LayoutView, PlacedLane } from "../../style/view.ts";
import { clamp } from "../../util/maths.ts";
import type { Growth } from "./growth.ts";

const ROOM_FOR_WOBBLE_AND_BARK = 0.89;
const MOST_OBLIQUE_STRETCH = 1.15;
const BARK_WOBBLE = 0.045;
const PITH_ECCENTRICITY = 0.06;
const TRUNK_ANGLE = -Math.PI / 2;
const WIDEST_ANGLE_BETWEEN_SLOTS = Math.PI / 4;
const OUTWARD_PROBE = 0.01;
const PIXELS_BETWEEN_RING_SAMPLES = 5;
const FEWEST_RING_SAMPLES = 48;
const MOST_RING_SAMPLES = 480;

export type Harmonics = (angle: number) => number;

export interface Disc {
  readonly centre: Point;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly radius: number;
  readonly pithOffset: Point;
  readonly pointAt: (reach: number, angle: number) => Point;
}

export interface Sectors {
  readonly angleBetweenSlots: number;
  readonly angleOf: (slot: number) => number;
}

export interface Section {
  readonly disc: Disc;
  readonly growth: Growth;
  readonly sectors: Sectors;
  readonly flowAroundKnots: (point: Point) => Point;
  readonly unit: number;
  readonly theme: Theme;
}

export function wiggle(grain: () => number, lowestHarmonic: number, highestHarmonic: number): Harmonics {
  const terms = Array.from({ length: highestHarmonic - lowestHarmonic + 1 }, (_, index) => ({
    harmonic: lowestHarmonic + index,
    amplitude: (grain() - 0.5) / (1 + index),
    phase: grain() * 2 * Math.PI,
  }));
  const totalAmplitude = terms.reduce((sum, term) => sum + Math.abs(term.amplitude), 0) || 1;
  return (angle) => terms.reduce((sum, term) => sum + term.amplitude * Math.cos(term.harmonic * angle + term.phase), 0) / totalAmplitude;
}

export function sawDisc(frame: Frame, grain: () => number): Disc {
  const [left, top, right, bottom] = frame.plot;
  const [plotWidth, plotHeight] = [right - left, bottom - top];
  const [centreX, centreY] = [(left + right) / 2, (top + bottom) / 2];
  const shortRadius = (Math.min(plotWidth, plotHeight) / 2) * ROOM_FOR_WOBBLE_AND_BARK;
  const longRadius = Math.min((Math.max(plotWidth, plotHeight) / 2) * ROOM_FOR_WOBBLE_AND_BARK, shortRadius * MOST_OBLIQUE_STRETCH);
  const [radiusX, radiusY] = plotWidth >= plotHeight ? [longRadius, shortRadius] : [shortRadius, longRadius];
  const outline = wiggle(grain, 2, 6);
  const pithAngle = grain() * 2 * Math.PI;
  const [offsetX, offsetY] = [Math.cos(pithAngle) * PITH_ECCENTRICITY * radiusX, Math.sin(pithAngle) * PITH_ECCENTRICITY * radiusY];
  const pointAt = (reach: number, angle: number): Point => {
    const wobbled = reach * (1 + BARK_WOBBLE * reach * outline(angle));
    return [centreX + offsetX * (1 - reach) + radiusX * wobbled * Math.cos(angle), centreY + offsetY * (1 - reach) + radiusY * wobbled * Math.sin(angle)];
  };
  return { centre: [centreX, centreY], radiusX, radiusY, radius: Math.min(radiusX, radiusY), pithOffset: [offsetX, offsetY], pointAt };
}

export function outwardAngle(disc: Disc, reach: number, angle: number): number {
  const [fromX, fromY] = disc.pointAt(reach, angle);
  const [toX, toY] = disc.pointAt(reach + OUTWARD_PROBE, angle);
  return Math.atan2(toY - fromY, toX - fromX);
}

export function sectorsFor(view: LayoutView): Sectors {
  const slotCount = view.highestSlot - view.lowestSlot + 1;
  const angleBetweenSlots = Math.min((2 * Math.PI) / slotCount, WIDEST_ANGLE_BETWEEN_SLOTS);
  return { angleBetweenSlots, angleOf: (slot) => TRUNK_ANGLE + slot * angleBetweenSlots };
}

export function branchStart(lane: PlacedLane): number {
  const first = lane.commits[0];
  return first ? (first.firstParentInRange?.timeFraction ?? first.timeFraction) : 0;
}

export function closedLine(section: Section, reachAt: Harmonics, reach: number): Point[] {
  const { disc, unit } = section;
  const sampleCount = clamp(
    Math.round((2 * Math.PI * reach * Math.max(disc.radiusX, disc.radiusY)) / (PIXELS_BETWEEN_RING_SAMPLES * unit)),
    FEWEST_RING_SAMPLES,
    MOST_RING_SAMPLES,
  );
  return Array.from({ length: sampleCount }, (_, sample) => {
    const angle = (2 * Math.PI * sample) / sampleCount;
    return section.flowAroundKnots(disc.pointAt(reachAt(angle), angle));
  });
}

export const woodTone = (theme: Theme, share: number): string => mix(theme.background, theme.glow ? theme.palette[0] : theme.ink, share);

export const knotDark = (theme: Theme): string => (theme.glow ? mix(theme.background, "#000000", 0.55) : mix(theme.ink, theme.background, 0.25));
