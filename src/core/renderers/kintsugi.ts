import { Band } from "../draw/band.ts";
import { mix } from "../draw/colour.ts";
import type { Frame } from "../draw/frame.ts";
import { densify, normalAt } from "../draw/geometry.ts";
import { element, group, type Point, polylinePath, type SvgElement } from "../draw/svg.ts";
import type { Theme } from "../draw/themes.ts";
import { cycle, type Face, mergeFaces } from "../graph/faces.ts";
import type { Edge, Graph } from "../model.ts";
import { defineStyle } from "../style/renderer.ts";
import type { LayoutView, PlacedCommit, PlacedEdge } from "../style/view.ts";
import { clamp } from "../util/maths.ts";
import { seededRandom, seedFromText } from "../util/random.ts";

const WANDER_IN_BOWL_RADII = 0.012;
const TRUNK_ANGLE = -Math.PI / 5;
const BOWL_SHARE_OF_PLOT = 0.97;
const IMPACT_RADIUS_SHARE = 0.04;
const BEND_SAMPLE_IN_SPACINGS = 0.2;
const INSET_IN_RIVET_RADII = 2.5;
const RIM_PAST_END_IN_RIVET_RADII = 2;
const DRIFT_MEMORY = 0.5;
const DRIFT_KICK = 1.6;
const HEAD_POOL_POINTS = 14;
const GOLD_ID = "gold";
const SHEEN_ID = "sheen";
const GOLD_STOPS = [
  [0, "#8a6420"],
  [0.22, "#e3b955"],
  [0.38, "#fff1b8"],
  [0.52, "#c8952f"],
  [0.7, "#f2d27c"],
  [0.86, "#a97a26"],
  [1, "#e6c165"],
] as const;

interface Bowl {
  readonly centre: Point;
  readonly radius: number;
  readonly rimAlong: number;
  readonly inset: number;
  readonly crackSpacing: number;
  readonly onBowl: (bandPoint: Point) => Point;
}

interface CrackStyle {
  readonly sampleStep: number;
  readonly amplitude: number;
}

interface Seam {
  readonly points: Point[];
  readonly width: number;
}

const layoutEdge = (edge: PlacedEdge): Edge => ({ parent: edge.parent?.sha ?? null, child: edge.child.sha, kind: edge.kind });

const bandPoint = (band: Band, commit: PlacedCommit): Point => [band.alongAt(commit.timeFraction), band.acrossAt(commit.slot)];

function bowlOf(frame: Frame, band: Band): Bowl {
  const [left, top, right, bottom] = frame.plot;
  const centre: Point = [(left + right) / 2, (top + bottom) / 2];
  const radius = (Math.min(right - left, bottom - top) / 2) * BOWL_SHARE_OF_PLOT;
  const inset = band.viaRadius * INSET_IN_RIVET_RADII;
  const impactAlong = band.timeAxisStart - inset;
  const rimAlong = band.timeAxisEnd + band.viaRadius * RIM_PAST_END_IN_RIVET_RADII;
  const impactRadius = radius * IMPACT_RADIUS_SHARE;
  const onBowl = ([along, across]: Point): Point => {
    const distance = impactRadius + clamp((along - impactAlong) / (rimAlong - impactAlong), 0, 1) * (radius - impactRadius);
    const slot = band.slotMid + (across - band.middleAcross) / band.spacing;
    const angle = TRUNK_ANGLE + (2 * Math.PI * slot) / band.slotCount;
    return [centre[0] + distance * Math.cos(angle), centre[1] + distance * Math.sin(angle)];
  };
  return { centre, radius, rimAlong, inset, crackSpacing: (Math.PI * radius) / band.slotCount, onBowl };
}

const bendRound = (band: Band, bowl: Bowl, bandPoints: Point[]): Point[] => densify(bandPoints, band.spacing * BEND_SAMPLE_IN_SPACINGS).map(bowl.onBowl);

function cumulativeDistances(points: readonly Point[]): number[] {
  const distances = [0];
  for (let index = 1; index < points.length; index++) {
    const [[fromX, fromY], [toX, toY]] = [points[index - 1], points[index]];
    distances.push(distances[index - 1] + Math.hypot(toX - fromX, toY - fromY));
  }
  return distances;
}

function wanderingCrack(points: Point[], style: CrackStyle, nextRandom: () => number): Point[] {
  const fine = densify(points, style.sampleStep);
  const distances = cumulativeDistances(fine);
  const total = distances.at(-1) ?? 0;
  if (!total) return points;
  let drift = 0;
  return fine.map(([x, y], index): Point => {
    if (index === 0 || index === fine.length - 1) return [x, y];
    drift = DRIFT_MEMORY * drift + (nextRandom() - 0.5) * DRIFT_KICK;
    const offset = drift * style.amplitude * Math.sin((Math.PI * distances[index]) / total);
    const [normalX, normalY] = normalAt(fine, index);
    return [x + normalX * offset, y + normalY * offset];
  });
}

const edgeSeed = (edge: PlacedEdge) => seedFromText(`${edge.parent?.sha ?? ""}>${edge.child.sha}`);

function edgeCracks(band: Band, bowl: Bowl, view: LayoutView, style: CrackStyle): Map<PlacedEdge, Point[]> {
  return new Map(
    view.edges.map((edge) => [edge, wanderingCrack(bendRound(band, bowl, band.edgePoints(layoutEdge(edge), bowl.inset)), style, seededRandom(edgeSeed(edge)))]),
  );
}

function crackBetween(band: Band, bowl: Bowl, view: LayoutView, cracks: Map<PlacedEdge, Point[]>) {
  const crackFromTo = (parent: PlacedCommit, child: PlacedCommit) => {
    const edge = view.edges.find((candidate) => candidate.parent === parent && candidate.child === child);
    return edge && cracks.get(edge);
  };
  return (from: PlacedCommit, to: PlacedCommit): Point[] =>
    crackFromTo(from, to) ?? [...(crackFromTo(to, from) ?? bendRound(band, bowl, [bandPoint(band, to), bandPoint(band, from)]))].reverse();
}

function shardOutline(face: Face, placedBySha: ReadonlyMap<string, PlacedCommit>, between: (from: PlacedCommit, to: PlacedCommit) => Point[]) {
  const shas = cycle(face);
  const ring = shas.flatMap((sha) => placedBySha.get(sha) ?? []);
  if (ring.length !== shas.length) return undefined;
  const outline = ring.flatMap((commit, index) => {
    const segment = between(commit, ring[(index + 1) % ring.length]);
    return index === 0 ? segment : segment.slice(1);
  });
  const xs = outline.map(([x]) => x);
  const ys = outline.map(([, y]) => y);
  return { outline, area: (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) };
}

const glazeShade = (theme: Theme, inkShare: number) => mix(theme.background, theme.ink, inkShare);

function shards(graph: Graph, view: LayoutView, theme: Theme, between: (from: PlacedCommit, to: PlacedCommit) => Point[]): SvgElement {
  const placedBySha = new Map(view.commits.map((commit) => [commit.sha, commit]));
  const outlines = mergeFaces(graph).flatMap((face) => shardOutline(face, placedBySha, between) ?? []);
  const nextGlaze = seededRandom(graph.commits.length * 7919 + view.lanes.length);
  const baseGlaze = theme.glow ? 0.1 : 0.07;
  return group(
    {},
    outlines
      .sort((a, b) => b.area - a.area)
      .map(({ outline }) => element("path", { d: `${polylinePath(outline)} Z`, fill: glazeShade(theme, baseGlaze + nextGlaze() * 0.1) })),
  );
}

function bowlBody(bowl: Bowl, theme: Theme): SvgElement {
  const [x, y] = bowl.centre;
  const { radius } = bowl;
  return group({}, [
    element("circle", { cx: x, cy: y + radius * 0.03, r: radius * 1.01, fill: "#000000", opacity: theme.glow ? 0.35 : 0.08 }),
    element("circle", {
      cx: x,
      cy: y,
      r: radius,
      fill: glazeShade(theme, theme.glow ? 0.07 : 0.05),
      stroke: glazeShade(theme, theme.glow ? 0.16 : 0.18),
      "stroke-width": radius * 0.025,
    }),
    element("circle", { cx: x, cy: y, r: radius * 0.36, fill: "none", stroke: glazeShade(theme, 0.12), "stroke-width": radius * 0.01 }),
  ]);
}

function gradients(bowl: Bowl, theme: Theme): SvgElement[] {
  const [x, y] = bowl.centre;
  const { radius } = bowl;
  const gold = element(
    "linearGradient",
    { id: GOLD_ID, gradientUnits: "userSpaceOnUse", x1: x - radius, y1: y - radius, x2: x + radius, y2: y + radius },
    GOLD_STOPS.map(([offset, colour]) => element("stop", { offset, "stop-color": colour })),
  );
  const sheen = element("radialGradient", { id: SHEEN_ID, gradientUnits: "userSpaceOnUse", cx: x - radius * 0.35, cy: y - radius * 0.4, r: radius * 1.5 }, [
    element("stop", { offset: "0%", "stop-color": "#ffffff", "stop-opacity": theme.glow ? 0.14 : 0.4 }),
    element("stop", { offset: "45%", "stop-color": "#ffffff", "stop-opacity": 0 }),
    element("stop", { offset: "100%", "stop-color": "#000000", "stop-opacity": theme.glow ? 0.3 : 0.08 }),
  ]);
  return [gold, sheen];
}

function seamsOf(
  band: Band,
  bowl: Bowl,
  view: LayoutView,
  cracks: Map<PlacedEdge, Point[]>,
  style: CrackStyle,
  widthOf: (commit: PlacedCommit) => number,
): Seam[] {
  const alongEdges = view.edges.flatMap((edge) => {
    const points = cracks.get(edge);
    const owner = (edge.kind === "merge" ? edge.parent : undefined) ?? edge.child;
    return points ? [{ points, width: widthOf(owner) }] : [];
  });
  const outToRim = view.lanes.flatMap((lane) => {
    const tip = lane.commits.at(-1);
    if (!lane.continuesAfterRange || !tip) return [];
    const [along, across] = bandPoint(band, tip);
    const bandPoints: Point[] = [
      [along, across],
      [bowl.rimAlong, across],
    ];
    return [{ points: wanderingCrack(bendRound(band, bowl, bandPoints), style, seededRandom(seedFromText(`${tip.sha}>`))), width: widthOf(tip) }];
  });
  return [...alongEdges, ...outToRim];
}

const seamId = (index: number) => `s${index}`;

const roundStrokes = { fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" } as const;

function seamLayers(seams: readonly Seam[], theme: Theme, baseWidth: number): SvgElement[] {
  const uses = (width: (seam: Seam) => number) => seams.map((seam, index) => element("use", { href: `#${seamId(index)}`, "stroke-width": width(seam) }));
  return [
    group(
      { ...roundStrokes, stroke: theme.glow ? "#000000" : glazeShade(theme, 0.5), "stroke-opacity": theme.glow ? 0.55 : 0.3 },
      uses(({ width }) => width + baseWidth * 1.2),
    ),
    group(
      { ...roundStrokes, stroke: `url(#${GOLD_ID})` },
      uses(({ width }) => width),
    ),
    group(
      { ...roundStrokes, stroke: "#fff6d6", "stroke-opacity": 0.5 },
      uses(({ width }) => Math.max(width * 0.22, 0.5)),
    ),
  ];
}

function headPool([x, y]: Point, radius: number, seed: string): SvgElement[] {
  const nextRandom = seededRandom(seedFromText(seed));
  const blob = Array.from({ length: HEAD_POOL_POINTS }, (_, index): Point => {
    const angle = (2 * Math.PI * index) / HEAD_POOL_POINTS;
    const wobbled = radius * (0.82 + 0.3 * nextRandom());
    return [x + wobbled * Math.cos(angle), y + wobbled * Math.sin(angle)];
  });
  return [
    element("path", { d: `${polylinePath(blob)} Z`, "stroke-linejoin": "round", stroke: `url(#${GOLD_ID})`, "stroke-width": radius * 0.4 }),
    element("ellipse", { cx: x - radius * 0.3, cy: y - radius * 0.35, rx: radius * 0.38, ry: radius * 0.2, fill: "#fff8de", opacity: 0.7 }),
  ];
}

function joins(band: Band, bowl: Bowl, view: LayoutView, widthOf: (commit: PlacedCommit) => number): SvgElement {
  const forkPoints = new Set(view.edges.flatMap((edge) => (edge.kind === "fork" && edge.parent ? [edge.parent] : [])));
  return group(
    { fill: `url(#${GOLD_ID})` },
    view.commits.flatMap((commit) => {
      const point = bowl.onBowl(bandPoint(band, commit));
      const width = widthOf(commit);
      if (commit.isHead) return headPool(point, Math.max(width * 2.8, bowl.radius * 0.025), commit.sha);
      if (commit.isMerge || forkPoints.has(commit)) return [element("circle", { cx: point[0], cy: point[1], r: width * 0.95 })];
      return [];
    }),
  );
}

export const kintsugi = defineStyle({
  name: "kintsugi",
  description: "A mended bowl: branches crack out from the centre, merges close shards, gold holds them.",
  tunes: ["arrange"],

  draw({ graph, frame, theme, view }) {
    const band = new Band(view.layout, frame, undefined, false);
    const bowl = bowlOf(frame, band);
    const style = { sampleStep: clamp(bowl.radius / 55, 4, 10), amplitude: Math.min(bowl.radius * WANDER_IN_BOWL_RADII, bowl.crackSpacing * 0.12) };
    const cracks = edgeCracks(band, bowl, view, style);
    const baseWidth = clamp(Math.min(bowl.radius / 150, bowl.crackSpacing * 0.08), 0.8, 5);
    const widthOf = (commit: PlacedCommit) => baseWidth * (1 + 0.35 * Math.log2(commit.weight));
    const seams = seamsOf(band, bowl, view, cracks, style, widthOf);
    const [x, y] = bowl.centre;
    return {
      definitions: [...gradients(bowl, theme), ...seams.map((seam, index) => element("path", { id: seamId(index), d: polylinePath(seam.points) }))],
      layers: [
        bowlBody(bowl, theme),
        shards(graph, view, theme, crackBetween(band, bowl, view, cracks)),
        element("circle", { cx: x, cy: y, r: bowl.radius, fill: `url(#${SHEEN_ID})` }),
        ...seamLayers(seams, theme, baseWidth),
        joins(band, bowl, view, widthOf),
      ],
    };
  },
});
