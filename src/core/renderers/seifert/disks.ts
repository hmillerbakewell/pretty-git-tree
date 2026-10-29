import { densify } from "../../draw/geometry.ts";
import { element, group, type Point, polylinePath, type SvgElement } from "../../draw/svg.ts";
import { clamp } from "../../util/maths.ts";
import { diskCentreAcross, onPage, PAPER, type Sketch, wobble } from "./sketch.ts";
import type { Disk } from "./surface.ts";

const ARC_STEPS = 12;
const HATCH_SPACING_IN_UNITS = 3.5;
const FEWEST_HATCH_LINES = 2;
const MOST_HATCH_LINES = 6;
const HATCH_CLEARANCE_IN_UNITS = 1.5;
const SHORTEST_HATCH_IN_UNITS = 4;
const HATCH_SAMPLE_IN_UNITS = 8;
const OUTLINE_SAMPLE_IN_UNITS = 6;

export const diskId = (index: number) => `disk${index}`;

const stadiumRadius = (sketch: Sketch, index: number) => {
  const [start, end] = sketch.diskExtents[index];
  return Math.min(sketch.halfDiskHeight, (end - start) / 2);
};

export function stadium(sketch: Sketch, index: number): Point[] {
  const [start, end] = sketch.diskExtents[index];
  const across = diskCentreAcross(sketch, index);
  const radius = stadiumRadius(sketch, index);
  const arc = (centreAlong: number, fromAngle: number): Point[] =>
    Array.from({ length: ARC_STEPS + 1 }, (_, step) => {
      const angle = fromAngle + (Math.PI * step) / ARC_STEPS;
      return [centreAlong + radius * Math.cos(angle), across + sketch.halfDiskHeight * Math.sin(angle)];
    });
  return [...arc(end - radius, -Math.PI / 2), ...arc(start + radius, Math.PI / 2)];
}

function liftingPenStrokes(sketch: Sketch, from: number, to: number, across: number): SvgElement[] {
  const { band, unit, nextRandom } = sketch;
  const length = to - from;
  const strokes: SvgElement[] = [];
  let along = from + nextRandom() * length * 0.08;
  while (along < to) {
    const strokeEnd = Math.min(to, along + length * (0.35 + nextRandom() * 0.5));
    const line: Point[] = [
      [along, across],
      [strokeEnd, across],
    ];
    strokes.push(
      element("path", { d: polylinePath(onPage(band, wobble(densify(line, HATCH_SAMPLE_IN_UNITS * unit), sketch.wobbleAmplitude * 0.5, nextRandom))) }),
    );
    along = strokeEnd + length * (0.02 + nextRandom() * 0.05);
  }
  return strokes;
}

function hatching(sketch: Sketch, disk: Disk, index: number): SvgElement {
  const { halfDiskHeight, unit } = sketch;
  const [start, end] = sketch.diskExtents[index];
  const across = diskCentreAcross(sketch, index);
  const radius = stadiumRadius(sketch, index);
  const lineCount = clamp(Math.round(halfDiskHeight / (HATCH_SPACING_IN_UNITS * unit)), FEWEST_HATCH_LINES, MOST_HATCH_LINES);
  const strokes = Array.from({ length: lineCount }, (_, line) => line).flatMap((line) => {
    const offset = halfDiskHeight * (0.88 - 0.62 * (line / Math.max(lineCount - 1, 1)) ** 1.5);
    const halfChord = Math.sqrt(Math.max(0, radius * radius - (offset * radius) ** 2 / (halfDiskHeight * halfDiskHeight)));
    const from = start + radius - halfChord + HATCH_CLEARANCE_IN_UNITS * unit;
    const to = end - radius + halfChord - HATCH_CLEARANCE_IN_UNITS * unit;
    return to - from < SHORTEST_HATCH_IN_UNITS * unit ? [] : liftingPenStrokes(sketch, from, to, across + offset);
  });
  return group({ stroke: sketch.ink, "stroke-width": sketch.fineWidth, fill: "none", "stroke-linecap": "round", opacity: disk.isStub ? 0.4 : 0.75 }, strokes);
}

export function diskDefinition(sketch: Sketch, disk: Disk, index: number): SvgElement {
  const { band, penWidth } = sketch;
  const outline = stadium(sketch, index);
  const paper = element("path", { d: `${polylinePath(onPage(band, outline))} Z`, fill: PAPER });
  const shading = hatching(sketch, disk, index);
  const closedOutline = densify([...outline, outline[0]], OUTLINE_SAMPLE_IN_UNITS * sketch.unit);
  const rim = element("path", {
    d: polylinePath(onPage(band, wobble(closedOutline, sketch.wobbleAmplitude, sketch.nextRandom))),
    fill: "none",
    stroke: sketch.ink,
    "stroke-width": penWidth,
    "stroke-linejoin": "round",
    "stroke-dasharray": disk.isStub ? `${(3 * penWidth).toFixed(1)} ${(2.5 * penWidth).toFixed(1)}` : null,
  });
  return group({ id: diskId(index) }, [paper, shading, rim]);
}
