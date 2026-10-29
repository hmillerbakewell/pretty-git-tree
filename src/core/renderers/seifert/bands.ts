import { densify } from "../../draw/geometry.ts";
import { element, group, type Point, polylinePath, type SvgElement } from "../../draw/svg.ts";
import { clamp, smoothstep } from "../../util/maths.ts";
import { diskId } from "./disks.ts";
import { diskCentreAcross, edgeAcross, endAlong, onPage, PAPER, type Sketch, wobble } from "./sketch.ts";
import type { RibbonBand, Tab } from "./surface.ts";

const RIBBON_SIDE_STEPS = 16;
const WIDE_RIBBON_IN_UNITS = 8;
const UNDER_CROSSING_HALF_WIDTH_IN_RIBBONS = 1.6;
const UNDER_CROSSING_HALF_HEIGHT_IN_DISKS = 1.2;
const TAB_TEAR_POINTS = 7;
const TAB_SAMPLE_IN_UNITS = 6;

export interface DrawnRibbon {
  readonly drawing: SvgElement;
  readonly clipPaths: readonly SvgElement[];
}

interface RibbonPath {
  readonly fromAlong: number;
  readonly toAlong: number;
  readonly fromAcross: number;
  readonly toAcross: number;
}

function ribbonSide(sketch: Sketch, path: RibbonPath, sideFraction: number): Point[] {
  const shift = (sideFraction - 0.5) * sketch.ribbonWidth;
  const [fromAlong, toAlong] = [path.fromAlong + shift, path.toAlong + shift];
  return Array.from({ length: RIBBON_SIDE_STEPS + 1 }, (_, step): Point => {
    const progress = step / RIBBON_SIDE_STEPS;
    return [fromAlong + (toAlong - fromAlong) * smoothstep(progress), path.fromAcross + (path.toAcross - path.fromAcross) * progress];
  });
}

function reachingIntoDisks(points: readonly Point[], reach: number): Point[] {
  const [firstAlong, firstAcross] = points[0];
  const [lastAlong, lastAcross] = points[points.length - 1];
  return [[firstAlong, firstAcross - reach], ...points, [lastAlong, lastAcross + reach]];
}

function ribbonBody(sketch: Sketch, path: RibbonPath): SvgElement[] {
  const { band, ink, nextRandom, wobbleAmplitude } = sketch;
  const direction = Math.sign(path.toAcross - path.fromAcross) || 1;
  const left = reachingIntoDisks(ribbonSide(sketch, path, 0), direction * sketch.penWidth);
  const right = reachingIntoDisks(ribbonSide(sketch, path, 1), direction * sketch.penWidth);
  const paper = element("path", { d: `${polylinePath(onPage(band, [...left, ...[...right].reverse()]))} Z`, fill: PAPER });
  const hatchCount = sketch.ribbonWidth > WIDE_RIBBON_IN_UNITS * sketch.unit ? 4 : 2;
  const hatches = Array.from({ length: hatchCount }, (_, line) =>
    element("path", { d: polylinePath(onPage(band, wobble(ribbonSide(sketch, path, 0.88 - 0.17 * line ** 1.2), wobbleAmplitude * 0.5, nextRandom))) }),
  );
  const shading = group({ stroke: ink, "stroke-width": sketch.fineWidth, fill: "none", "stroke-linecap": "round", opacity: 0.75 }, hatches);
  const sides = [0, 1].map((sideFraction) =>
    element("path", {
      d: polylinePath(onPage(band, wobble(ribbonSide(sketch, path, sideFraction), wobbleAmplitude, nextRandom))),
      fill: "none",
      stroke: ink,
      "stroke-width": sketch.penWidth,
      "stroke-linecap": "round",
    }),
  );
  return [paper, shading, ...sides];
}

function underCrossing(sketch: Sketch, path: RibbonPath, bandIndex: number, disk: number): { clipPath: SvgElement; patch: SvgElement } | undefined {
  const across = diskCentreAcross(sketch, disk);
  const [low, high] = [Math.min(path.fromAcross, path.toAcross), Math.max(path.fromAcross, path.toAcross)];
  if (across <= low || across >= high || (bandIndex + disk) % 2 === 0) return undefined;
  const along = path.fromAlong + (path.toAlong - path.fromAlong) * smoothstep((across - path.fromAcross) / (path.toAcross - path.fromAcross));
  const [diskStart, diskEnd] = sketch.diskExtents[disk];
  if (along < diskStart || along > diskEnd) return undefined;
  const halfWidth = sketch.ribbonWidth * UNDER_CROSSING_HALF_WIDTH_IN_RIBBONS;
  const halfHeight = sketch.halfDiskHeight * UNDER_CROSSING_HALF_HEIGHT_IN_DISKS;
  const box: Point[] = [
    [along - halfWidth, across - halfHeight],
    [along + halfWidth, across - halfHeight],
    [along + halfWidth, across + halfHeight],
    [along - halfWidth, across + halfHeight],
  ];
  const id = `under${bandIndex}-${disk}`;
  return {
    clipPath: element("clipPath", { id }, [element("path", { d: `${polylinePath(onPage(sketch.band, box))} Z` })]),
    patch: element("use", { href: `#${diskId(disk)}`, "clip-path": `url(#${id})` }),
  };
}

export function ribbon(sketch: Sketch, ribbonBand: RibbonBand, bandIndex: number): DrawnRibbon {
  const [from, to] = ribbonBand.ends;
  const path = { fromAlong: endAlong(sketch, from), toAlong: endAlong(sketch, to), fromAcross: edgeAcross(sketch, from), toAcross: edgeAcross(sketch, to) };
  const body = ribbonBody(sketch, path);
  const crossings = sketch.surface.disks.flatMap((_, disk) =>
    disk === from.disk || disk === to.disk ? [] : (underCrossing(sketch, path, bandIndex, disk) ?? []),
  );
  return { drawing: group({}, [...body, ...crossings.map(({ patch }) => patch)]), clipPaths: crossings.map(({ clipPath }) => clipPath) };
}

export function tornTab(sketch: Sketch, tab: Tab): SvgElement {
  const { band, ink, unit, ribbonWidth, penWidth } = sketch;
  const along = endAlong(sketch, tab);
  const edge = edgeAcross(sketch, tab);
  const direction = tab.onHighEdge ? 1 : -1;
  const reach = clamp(band.spacing * 0.4, 6 * unit, 40 * unit);
  const tear = Array.from(
    { length: TAB_TEAR_POINTS },
    (_, step): Point => [
      along - ribbonWidth / 2 + (ribbonWidth * step) / (TAB_TEAR_POINTS - 1),
      edge + direction * (reach + (step % 2 ? 0.12 : -0.05) * reach),
    ],
  );
  const sideAt = (offset: number, tearPoint: Point): Point[] => [
    [along + offset, edge - direction * penWidth],
    [along + offset, tearPoint[1]],
  ];
  const leftSide = sideAt(-ribbonWidth / 2, tear[0]);
  const rightSide = sideAt(ribbonWidth / 2, tear[tear.length - 1]);
  const shadeLine: Point[] = [
    [along + ribbonWidth * 0.32, edge],
    [along + ribbonWidth * 0.32, edge + direction * reach * 0.85],
  ];
  return group({}, [
    element("path", { d: `${polylinePath(onPage(band, [...leftSide, ...tear.slice(1, -1), ...[...rightSide].reverse()]))} Z`, fill: PAPER }),
    element("path", {
      d: polylinePath(onPage(band, densify(shadeLine, TAB_SAMPLE_IN_UNITS * unit))),
      stroke: ink,
      "stroke-width": sketch.fineWidth,
      opacity: 0.6,
    }),
    ...[leftSide, rightSide].map((side) =>
      element("path", {
        d: polylinePath(onPage(band, wobble(densify(side, TAB_SAMPLE_IN_UNITS * unit), sketch.wobbleAmplitude * 0.6, sketch.nextRandom))),
        fill: "none",
        stroke: ink,
        "stroke-width": penWidth,
        "stroke-linecap": "round",
      }),
    ),
    element("path", { d: polylinePath(onPage(band, tear)), fill: "none", stroke: ink, "stroke-width": sketch.fineWidth, "stroke-linejoin": "round" }),
  ]);
}
