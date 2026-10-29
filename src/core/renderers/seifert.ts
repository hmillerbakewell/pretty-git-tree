import { backgroundPaint } from "../draw/backdrop.ts";
import { Band } from "../draw/band.ts";
import type { Frame } from "../draw/frame.ts";
import { element, group, type Point, polylinePath, type SvgElement } from "../draw/svg.ts";
import { SERIF, type Theme } from "../draw/themes.ts";
import type { Graph, Lane } from "../model.ts";
import { defineStyle } from "../style/renderer.ts";
import type { LayoutView } from "../style/view.ts";
import { clamp } from "../util/maths.ts";
import { seededRandom, seedFromText } from "../util/random.ts";
import { plural } from "../util/text.ts";
import { ribbon, tornTab } from "./seifert/bands.ts";
import { diskDefinition, diskId } from "./seifert/disks.ts";
import { endAlong, PAPER_ID, type Sketch, wobble } from "./seifert/sketch.ts";
import { ribbonSurface, type Surface } from "./seifert/surface.ts";

export type { BandKind, Disk, End, RibbonBand, Surface, Tab } from "./seifert/surface.ts";
export { ribbonSurface };

const HEAD_RING_STEPS = 24;
const CAPTION_DROP_IN_UNITS = 0.035 * 1080;
const CAPTION_SIZE_IN_UNITS = 0.026 * 1080;

function bandWithStubRows(view: LayoutView, surface: Surface, frame: Frame): Band {
  const stubLanes = surface.disks
    .filter((disk) => disk.isStub)
    .map((disk): Lane => ({ colourIndex: 0, slot: disk.slot, shas: [], entersFromLeftEdge: false, leavesThroughRightEdge: false }));
  return new Band({ ...view.layout, lanes: [...view.layout.lanes, ...stubLanes] }, frame, undefined, false);
}

function diskExtents(band: Band, surface: Surface, halfDiskHeight: number, ribbonWidth: number): [start: number, end: number][] {
  const margin = ribbonWidth * 1.1 + halfDiskHeight * 0.3;
  return surface.disks.map((disk, index) => {
    const endsAlong = surface.bands
      .flatMap((ribbonBand) => ribbonBand.ends.filter((end) => end.disk === index))
      .map((end) => endAlong({ band, ribbonWidth }, end));
    return [Math.min(band.alongAt(disk.start), ...endsAlong) - margin, Math.max(band.alongAt(disk.end), ...endsAlong) + margin];
  });
}

function sketchOf(graph: Graph, frame: Frame, theme: Theme, surface: Surface, band: Band): Sketch {
  const { unit } = frame;
  const halfDiskHeight = clamp(band.spacing * 0.24, 3 * unit, 34 * unit);
  const ribbonWidth = clamp(Math.min(band.unit * 0.55, band.spacing * 0.32), 3 * unit, 26 * unit);
  return {
    band,
    surface,
    unit,
    ink: theme.ink,
    halfDiskHeight,
    ribbonWidth,
    penWidth: Math.max(1.3 * unit, 0.9),
    fineWidth: Math.max(0.7 * unit, 0.5),
    wobbleAmplitude: 0.9 * unit,
    diskExtents: diskExtents(band, surface, halfDiskHeight, ribbonWidth),
    nextRandom: seededRandom(seedFromText(graph.commits.map((commit) => commit.sha).join(""))),
  };
}

function headMark(sketch: Sketch, view: LayoutView): SvgElement[] {
  const head = view.commits.find((commit) => commit.isHead);
  if (!head) return [];
  const [x, y] = sketch.band.toPlane(sketch.band.alongAt(head.timeFraction), sketch.band.acrossAt(head.slot));
  const radius = Math.max(sketch.halfDiskHeight * 0.45, 3 * sketch.unit);
  const ring = Array.from({ length: HEAD_RING_STEPS + 1 }, (_, step): Point => {
    const angle = (2 * Math.PI * step) / HEAD_RING_STEPS;
    return [x + radius * Math.cos(angle), y + radius * Math.sin(angle)];
  });
  return [
    element("path", {
      d: polylinePath(wobble(ring, sketch.wobbleAmplitude, sketch.nextRandom)),
      fill: "none",
      stroke: sketch.ink,
      "stroke-width": sketch.penWidth,
    }),
    element("circle", { cx: x, cy: y, r: radius * 0.28, fill: sketch.ink }),
  ];
}

function caption(graph: Graph, frame: Frame, theme: Theme, surface: Surface): SvgElement[] {
  if (graph.commits.length === 0) return [];
  const text = `drawn as a surface of genus ${surface.genus} with ${plural(surface.boundaries, "boundary circle")}`;
  const attributes = {
    x: frame.width - frame.margin,
    y: frame.margin + frame.unit * CAPTION_DROP_IN_UNITS,
    "text-anchor": "end",
    "font-family": SERIF,
    "font-style": "italic",
    "font-size": Math.round(frame.unit * CAPTION_SIZE_IN_UNITS),
    fill: theme.muted,
  };
  return [element("text", attributes, [text])];
}

export const seifert = defineStyle({
  name: "seifert",
  description: "The history as a surface: branches are disks, forks and merges bands, drawn as in a topology book.",
  tunes: ["arrange"],

  draw({ graph, frame, theme, view }) {
    const surface = ribbonSurface(graph, view);
    const sketch = sketchOf(graph, frame, theme, surface, bandWithStubRows(view, surface, frame));
    const disks = surface.disks.map((disk, index) => diskDefinition(sketch, disk, index));
    const ribbons = surface.bands.map((ribbonBand, index) => ribbon(sketch, ribbonBand, index));
    const tabs = surface.tabs.map((tab) => tornTab(sketch, tab));
    const marks = headMark(sketch, view);
    return {
      definitions: [backgroundPaint(frame, theme, PAPER_ID), ...disks, ...ribbons.flatMap(({ clipPaths }) => clipPaths)],
      layers: [
        group(
          {},
          disks.map((_, index) => element("use", { href: `#${diskId(index)}` })),
        ),
        group({}, tabs),
        group(
          {},
          ribbons.map(({ drawing }) => drawing),
        ),
        group({}, marks),
        ...caption(graph, frame, theme, surface),
      ],
      headingFont: SERIF,
    };
  },
});
