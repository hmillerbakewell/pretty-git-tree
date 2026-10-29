import { Band } from "../draw/band.ts";
import { element, formatNumber, group, type Point, polylinePath, type SvgElement } from "../draw/svg.ts";
import type { Theme } from "../draw/themes.ts";
import { cycle, type Face, firstSide, mergedSide, mergeFaces } from "../graph/faces.ts";
import type { Edge } from "../model.ts";
import { defineStyle } from "../style/renderer.ts";
import type { LayoutView, PlacedCommit, PlacedEdge } from "../style/view.ts";

const SHINE_ID = "shine";
const LEAD_ON_DARK_GLASS = "#15161b";
const GLASS_OPACITY = 0.55;
const GLOWING_GLASS_OPACITY = 0.72;
const LEAD_WIDTH_IN_TRACES = 2;
const TINT_WIDTH_IN_TRACES = 0.6;
const LEAD_INSET_IN_RIVET_RADII = 2.5;
const OUTPUT_TAIL_IN_RIVET_RADII = 2;
const SINGLE_PARENT_RIVET_SHARE = 0.75;
const RIVET_CORE_SHARE = 0.45;
const DUAL_VERTEX_RIVET_SHARE = 0.55;
const SMALLEST_DUAL_VERTEX_RADIUS = 2.5;
const DUAL_VERTEX_HALO_SHARE = 1.9;
const DUAL_LINE_TRACE_SHARE = 0.45;
const THINNEST_DUAL_LINE = 1.2;

interface Glass {
  readonly bandOutline: readonly Point[];
  readonly start: number;
  readonly end: number;
  readonly firstSideCross: number;
  readonly mergedSideCross: number;
  readonly colour: string;
}

type PathBetween = (from: PlacedCommit, to: PlacedCommit) => Point[];

const sideWidth = (glass: Glass) => glass.mergedSideCross - glass.firstSideCross;
const area = (glass: Glass) => (glass.end - glass.start) * Math.abs(sideWidth(glass));
const middleAlong = (glass: Glass) => (glass.start + glass.end) / 2;

const contains = (outer: Glass, inner: Glass): boolean =>
  inner !== outer &&
  outer.start <= inner.start &&
  inner.end <= outer.end &&
  sideWidth(outer) * sideWidth(inner) > 0 &&
  Math.abs(inner.mergedSideCross - outer.firstSideCross) < Math.abs(sideWidth(outer));

const layoutEdge = (edge: PlacedEdge): Edge => ({ parent: edge.parent?.sha ?? null, child: edge.child.sha, kind: edge.kind });

const bandPoint = (band: Band, commit: PlacedCommit): Point => [band.alongAt(commit.timeFraction), band.acrossAt(commit.slot)];

function edgesByChild(view: LayoutView): Map<PlacedCommit, PlacedEdge[]> {
  const byChild = new Map<PlacedCommit, PlacedEdge[]>();
  for (const edge of view.edges) byChild.set(edge.child, [...(byChild.get(edge.child) ?? []), edge]);
  return byChild;
}

function pathBetween(band: Band, view: LayoutView): PathBetween {
  const byChild = edgesByChild(view);
  const edgeFromTo = (parent: PlacedCommit, child: PlacedCommit) => byChild.get(child)?.find((edge) => edge.parent === parent);
  return (from, to) => {
    const forward = edgeFromTo(from, to);
    if (forward) return band.edgePoints(layoutEdge(forward));
    const backward = edgeFromTo(to, from);
    if (backward) return band.edgePoints(layoutEdge(backward)).reverse();
    return [bandPoint(band, from), bandPoint(band, to)];
  };
}

function glassOf(face: Face, band: Band, placedBySha: ReadonlyMap<string, PlacedCommit>, between: PathBetween): Glass | undefined {
  const shas = cycle(face);
  const ring = shas.flatMap((sha) => placedBySha.get(sha) ?? []);
  const firstSideCommit = placedBySha.get(firstSide(face));
  const mergedSideCommit = placedBySha.get(mergedSide(face));
  if (ring.length !== shas.length || !firstSideCommit || !mergedSideCommit) return undefined;
  const bandOutline = ring.flatMap((commit, index) => {
    const segment = between(commit, ring[(index + 1) % ring.length]);
    return index === 0 ? segment : segment.slice(1);
  });
  const alongs = bandOutline.map(([along]) => along);
  return {
    bandOutline,
    start: Math.min(...alongs),
    end: Math.max(...alongs),
    firstSideCross: band.acrossAt(firstSideCommit.slot),
    mergedSideCross: band.acrossAt(mergedSideCommit.slot),
    colour: mergedSideCommit.colour,
  };
}

const smallestContainer = (glasses: readonly Glass[], glass: Glass): Glass | undefined =>
  glasses.reduce<Glass | undefined>((best, candidate) => (contains(candidate, glass) && (!best || area(candidate) < area(best)) ? candidate : best), undefined);

function dualVertex(glass: Glass, children: readonly Glass[]): Point {
  const reach = Math.max(0, ...children.map((child) => Math.abs(child.mergedSideCross - glass.firstSideCross)));
  const towardsMergedSide = Math.sign(sideWidth(glass)) || -1;
  return [middleAlong(glass), glass.firstSideCross + towardsMergedSide * ((reach + Math.abs(sideWidth(glass))) / 2)];
}

const shineGradient = element("radialGradient", { id: SHINE_ID, cx: "35%", cy: "30%", r: "80%" }, [
  element("stop", { offset: "0%", "stop-color": "#ffffff", "stop-opacity": 0.35 }),
  element("stop", { offset: "60%", "stop-color": "#ffffff", "stop-opacity": 0.04 }),
  element("stop", { offset: "100%", "stop-color": "#000000", "stop-opacity": 0.15 }),
]);

function glassPanes(band: Band, theme: Theme, glasses: readonly Glass[]): SvgElement {
  const largestFirst = [...glasses].sort((a, b) => area(b) - area(a));
  return group(
    {},
    largestFirst.flatMap((glass) => {
      const d = `${polylinePath(glass.bandOutline.map(([along, across]) => band.toPlane(along, across)))} Z`;
      return [
        element("path", { d, fill: glass.colour, "fill-opacity": theme.glow ? GLOWING_GLASS_OPACITY : GLASS_OPACITY }),
        element("path", { d, fill: `url(#${SHINE_ID})` }),
      ];
    }),
  );
}

interface Came {
  readonly d: string;
  readonly colour: string;
}

function cames(band: Band, view: LayoutView): Came[] {
  const inset = band.viaRadius * LEAD_INSET_IN_RIVET_RADII;
  const alongEdges = view.edges.map((edge) => ({
    d: polylinePath(band.edgePoints(layoutEdge(edge), inset).map(([along, across]) => band.toPlane(along, across))),
    colour: ((edge.kind === "merge" ? edge.parent : undefined) ?? edge.child).colour,
  }));
  const outputTails = view.lanes.flatMap((lane) => {
    const tip = lane.commits.at(-1);
    if (!lane.continuesAfterRange || !tip) return [];
    const across = band.acrossAt(lane.slot);
    const tailEnd = band.timeAxisEnd + band.viaRadius * OUTPUT_TAIL_IN_RIVET_RADII;
    return [{ d: polylinePath([band.toPlane(band.alongAt(tip.timeFraction), across), band.toPlane(tailEnd, across)]), colour: lane.colour }];
  });
  return [...alongEdges, ...outputTails];
}

const roundStrokes = { fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" } as const;

function leading(band: Band, leadColour: string, came: readonly Came[]): SvgElement[] {
  return [
    group(
      { ...roundStrokes, stroke: leadColour, "stroke-width": band.trace * LEAD_WIDTH_IN_TRACES },
      came.map(({ d }) => element("path", { d })),
    ),
    group(
      { ...roundStrokes, "stroke-width": band.trace * TINT_WIDTH_IN_TRACES, opacity: 0.9 },
      came.map(({ d, colour }) => element("path", { d, stroke: colour })),
    ),
  ];
}

function rivet(band: Band, leadColour: string, commit: PlacedCommit): SvgElement[] {
  const [x, y] = band.toPlane(...bandPoint(band, commit));
  const radius = band.viaRadius * (commit.isMerge ? 1 : SINGLE_PARENT_RIVET_SHARE);
  return [
    element("circle", { cx: x, cy: y, r: radius, fill: leadColour }),
    element("circle", { cx: x, cy: y, r: radius * RIVET_CORE_SHARE, fill: commit.colour }),
  ];
}

function dualEdge(band: Band, from: Point, to: Point, through: Point): SvgElement {
  const control: Point = [2 * through[0] - (from[0] + to[0]) / 2, 2 * through[1] - (from[1] + to[1]) / 2];
  const [start, bend, end] = [from, control, to].map(([along, across]) => band.toPlane(along, across).map(formatNumber).join(","));
  return element("path", { d: `M${start} Q${bend} ${end}` });
}

function dualEdges(band: Band, glasses: readonly Glass[], containerOf: Map<Glass, Glass | undefined>, vertexOf: Map<Glass, Point>): SvgElement[] {
  const vertex = (glass: Glass): Point => vertexOf.get(glass) ?? [middleAlong(glass), glass.firstSideCross];
  const nested = glasses.flatMap((glass) => {
    const container = containerOf.get(glass);
    return container ? [dualEdge(band, vertex(glass), vertex(container), [middleAlong(glass), glass.mergedSideCross])] : [];
  });
  const outermost = glasses.filter((glass) => !containerOf.get(glass));
  const acrossTrunk = outermost.flatMap((a, index) =>
    outermost.slice(index + 1).flatMap((b) => {
      const [overlapStart, overlapEnd] = [Math.max(a.start, b.start), Math.min(a.end, b.end)];
      const facingAcross = sideWidth(a) * sideWidth(b) < 0 && a.firstSideCross === b.firstSideCross;
      return overlapEnd > overlapStart && facingAcross ? [dualEdge(band, vertex(a), vertex(b), [(overlapStart + overlapEnd) / 2, a.firstSideCross])] : [];
    }),
  );
  return [...nested, ...acrossTrunk];
}

function dualVertexDots(band: Band, theme: Theme, vertices: readonly Point[]): SvgElement {
  const radius = Math.max(band.viaRadius * DUAL_VERTEX_RIVET_SHARE, SMALLEST_DUAL_VERTEX_RADIUS);
  return group(
    {},
    vertices.flatMap((vertex) => {
      const [x, y] = band.toPlane(...vertex);
      return [
        element("circle", { cx: x, cy: y, r: radius * DUAL_VERTEX_HALO_SHARE, fill: theme.ink, opacity: 0.18 }),
        element("circle", { cx: x, cy: y, r: radius, fill: theme.ink }),
      ];
    }),
  );
}

function dualGraph(band: Band, theme: Theme, glasses: readonly Glass[]): SvgElement[] {
  const containerOf = new Map(glasses.map((glass) => [glass, smallestContainer(glasses, glass)]));
  const vertexOf = new Map(
    glasses.map((glass): [Glass, Point] => [
      glass,
      dualVertex(
        glass,
        glasses.filter((other) => containerOf.get(other) === glass),
      ),
    ]),
  );
  const lines = group(
    {
      fill: "none",
      stroke: theme.ink,
      "stroke-width": Math.max(band.trace * DUAL_LINE_TRACE_SHARE, THINNEST_DUAL_LINE),
      "stroke-dasharray": "1 5",
      "stroke-linecap": "round",
      opacity: 0.85,
    },
    dualEdges(band, glasses, containerOf, vertexOf),
  );
  return [lines, dualVertexDots(band, theme, [...vertexOf.values()])];
}

export const faces = defineStyle({
  name: "faces",
  description: "Merges as stained-glass faces, with the dual graph across them.",
  tunes: ["arrange"],

  draw({ graph, frame, theme, view }) {
    const band = new Band(view.layout, frame);
    const placedBySha = new Map(view.commits.map((commit) => [commit.sha, commit]));
    const between = pathBetween(band, view);
    const glasses = mergeFaces(graph).flatMap((face) => glassOf(face, band, placedBySha, between) ?? []);
    const leadColour = theme.glow ? LEAD_ON_DARK_GLASS : theme.ink;
    return {
      definitions: [shineGradient],
      layers: [
        glassPanes(band, theme, glasses),
        ...leading(band, leadColour, cames(band, view)),
        group(
          {},
          view.commits.flatMap((commit) => rivet(band, leadColour, commit)),
        ),
        ...dualGraph(band, theme, glasses),
      ],
    };
  },
});
