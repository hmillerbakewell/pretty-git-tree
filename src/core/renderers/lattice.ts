import type { Frame } from "../draw/frame.ts";
import { glowFilter, headRing } from "../draw/marks.ts";
import { arrow } from "../draw/shapes.ts";
import { element, formatNumber, group, type Point, polylinePath, type SvgElement } from "../draw/svg.ts";
import type { Theme } from "../draw/themes.ts";
import { cycle, type Face, mergeBases, mergedSide, mergeFaces } from "../graph/faces.ts";
import type { Graph } from "../model.ts";
import { defineStyle } from "../style/renderer.ts";
import type { LayoutView, PlacedCommit, PlacedLane } from "../style/view.ts";
import { clamp } from "../util/maths.ts";

const ANGLE_FROM_PARENT_BRANCH = (38 * Math.PI) / 180;
const STEEPEST_BRANCH_ANGLE = (80 * Math.PI) / 180;
const LOOSE_ROOT_SPACING = 1.5;
const PLOT_INSET = 20;
const SMALLEST_EXTENT = 1e-6;

interface Placement {
  readonly toCanvas: (point: Point) => Point;
  readonly scale: number;
}

function branchDirections(view: LayoutView): Map<PlacedLane, Point> {
  const angles = new Map<PlacedLane, number>();
  const trunk = view.lanes[0];
  view.lanes.forEach((lane, laneIndex) => {
    if (laneIndex === 0) {
      angles.set(lane, 0);
      return;
    }
    const parentLane = lane.commits[0]?.firstParentInRange?.lane ?? trunk;
    const side = lane.slot >= (parentLane?.slot ?? 0) ? 1 : -1;
    const parentAngle = parentLane ? (angles.get(parentLane) ?? 0) : 0;
    angles.set(lane, clamp(parentAngle + side * ANGLE_FROM_PARENT_BRANCH, -STEEPEST_BRANCH_ANGLE, STEEPEST_BRANCH_ANGLE));
  });
  return new Map([...angles].map(([lane, angle]) => [lane, [Math.cos(angle), Math.sin(angle)]]));
}

function latticePositions(graph: Graph, view: LayoutView): Map<PlacedCommit, Point> {
  const placedBySha = new Map(view.commits.map((commit) => [commit.sha, commit]));
  const bases = mergeBases(graph);
  const directions = branchDirections(view);
  const positions = new Map<PlacedCommit, Point>();
  let looseRoots = 0;
  for (const commit of graph.commits.flatMap((graphCommit) => placedBySha.get(graphCommit.sha) ?? [])) {
    const [firstParent, ...mergedParents] = commit.parentsInRange;
    const firstParentPosition = firstParent && positions.get(firstParent);
    if (!firstParentPosition) {
      positions.set(commit, [0, looseRoots * LOOSE_ROOT_SPACING * (looseRoots % 2 ? 1 : -1)]);
      looseRoots++;
      continue;
    }
    const [directionX, directionY] = directions.get(commit.lane) ?? [1, 0];
    const step = 1 + 0.5 * Math.log2(commit.weight);
    const displacements = mergedParents.map((merged) => mergeDisplacement(positions, merged, placedBySha.get(bases.get(`${commit.sha}:${merged.sha}`) ?? "")));
    positions.set(
      commit,
      displacements.reduce<Point>(
        ([x, y], [dx, dy]) => [x + dx, y + dy],
        [firstParentPosition[0] + directionX * step, firstParentPosition[1] + directionY * step],
      ),
    );
  }
  return positions;
}

function mergeDisplacement(positions: ReadonlyMap<PlacedCommit, Point>, merged: PlacedCommit, base: PlacedCommit | undefined): Point {
  const mergedPosition = positions.get(merged);
  const basePosition = base && positions.get(base);
  if (!mergedPosition || !basePosition) return [0, 0];
  return [mergedPosition[0] - basePosition[0], mergedPosition[1] - basePosition[1]];
}

function principalAngle(points: readonly Point[]): number {
  if (points.length < 2) return 0;
  const meanX = points.reduce((sum, [x]) => sum + x, 0) / points.length;
  const meanY = points.reduce((sum, [, y]) => sum + y, 0) / points.length;
  let varianceX = 0;
  let varianceY = 0;
  let covariance = 0;
  for (const [x, y] of points) {
    varianceX += (x - meanX) ** 2;
    varianceY += (y - meanY) ** 2;
    covariance += (x - meanX) * (y - meanY);
  }
  return 0.5 * Math.atan2(2 * covariance, varianceX - varianceY);
}

const extent = (values: readonly number[]): [low: number, high: number] => [
  values.reduce((low, value) => Math.min(low, value), Infinity),
  values.reduce((high, value) => Math.max(high, value), -Infinity),
];

function fitToPlot(points: readonly Point[], frame: Frame): Placement {
  const [left, top, right, bottom] = frame.plot;
  const horizontal: Point = [left + PLOT_INSET, right - PLOT_INSET];
  const verticalSpan: Point = [top + PLOT_INSET, bottom - PLOT_INSET];
  const [along, across] = frame.vertical ? [verticalSpan, horizontal] : [horizontal, verticalSpan];
  const angle = principalAngle(points);
  const [cosine, sine] = [Math.cos(angle), Math.sin(angle)];
  const rotate = ([x, y]: Point): Point => [x * cosine + y * sine, -x * sine + y * cosine];
  const rotated: Point[] = points.length ? points.map(rotate) : [[0, 0]];
  const [alongLow, alongHigh] = extent(rotated.map(([u]) => u));
  const [acrossLow, acrossHigh] = extent(rotated.map(([, v]) => v));
  const alongFit = (along[1] - along[0]) / Math.max(alongHigh - alongLow, SMALLEST_EXTENT);
  const acrossScale = clamp((across[1] - across[0]) / Math.max(acrossHigh - acrossLow, SMALLEST_EXTENT), alongFit * 0.6, alongFit * 6);
  const alongScale = Math.min(alongFit, acrossScale * 3);
  const toCanvas = (point: Point): Point => {
    const [u, v] = rotate(point);
    const alongPixel = (along[0] + along[1]) / 2 + (u - (alongHigh + alongLow) / 2) * alongScale;
    const acrossPixel = (across[0] + across[1]) / 2 + (v - (acrossHigh + acrossLow) / 2) * acrossScale;
    return frame.vertical ? [acrossPixel, alongPixel] : [alongPixel, acrossPixel];
  };
  return { toCanvas, scale: Math.min(alongScale, acrossScale) };
}

function parallelogramTile(points: readonly Point[], colour: string, theme: Theme, lineWidth: number): SvgElement {
  return element("path", {
    d: `${polylinePath([...points])} Z`,
    fill: colour,
    "fill-opacity": theme.glow ? 0.16 : 0.2,
    stroke: colour,
    "stroke-opacity": 0.35,
    "stroke-width": lineWidth * 0.6,
    "stroke-dasharray": "3 4",
  });
}

function faceTile(
  face: Face,
  canvasPointOf: (sha: string) => Point | undefined,
  colourOf: (sha: string) => string | undefined,
  theme: Theme,
  lineWidth: number,
) {
  const points = cycle(face)
    .map(canvasPointOf)
    .filter((point) => point !== undefined);
  const colour = colourOf(mergedSide(face));
  return points.length < 3 || !colour ? undefined : parallelogramTile(points, colour, theme, lineWidth);
}

function commitNode(commit: PlacedCommit, [x, y]: Point, radius: number, lineWidth: number, theme: Theme): SvgElement[] {
  const halfSide = radius * 1.15;
  const node = commit.isMerge
    ? element("rect", {
        x: x - halfSide,
        y: y - halfSide,
        width: 2 * halfSide,
        height: 2 * halfSide,
        rx: halfSide * 0.2,
        fill: commit.colour,
        transform: `rotate(45 ${formatNumber(x)} ${formatNumber(y)})`,
      })
    : element("circle", {
        cx: x,
        cy: y,
        r: radius * (1 + 0.25 * Math.log2(commit.weight)),
        fill: theme.background,
        stroke: commit.colour,
        "stroke-width": lineWidth,
      });
  return commit.isHead ? [node, headRing([x, y], radius * 2.2, theme)] : [node];
}

export const lattice = defineStyle({
  name: "lattice",
  description: "Dual view: each branch a direction, merges as closed parallelograms.",
  tunes: ["arrange"],
  showsGrid: true,

  draw({ graph, frame, theme, view }) {
    const positions = latticePositions(graph, view);
    const { toCanvas, scale } = fitToPlot([...positions.values()], frame);
    const canvasPoint = (commit: PlacedCommit): Point | undefined => {
      const position = positions.get(commit);
      return position && toCanvas(position);
    };
    const placedBySha = new Map(view.commits.map((commit) => [commit.sha, commit]));
    const canvasPointOf = (sha: string) => {
      const commit = placedBySha.get(sha);
      return commit && canvasPoint(commit);
    };
    const radius = clamp(scale * 0.16, 2.5, 9);
    const lineWidth = clamp(scale * 0.06, 1.2, 4);
    const arrows = view.edges.flatMap(({ parent, child, kind }) => {
      const [from, to] = [parent && canvasPoint(parent), canvasPoint(child)];
      if (!parent || !from || !to) return [];
      const colour = kind === "merge" ? parent.colour : child.colour;
      return arrow(from, to, colour, lineWidth, lineWidth * 3.2, [radius * 1.2, radius * 1.3]);
    });
    const inTimeOrder = view.commitsInTimeOrder;
    return {
      layers: [
        group(
          {},
          mergeFaces(graph).flatMap((face) => faceTile(face, canvasPointOf, (sha) => placedBySha.get(sha)?.colour, theme, lineWidth) ?? []),
        ),
        group(glowFilter(theme), arrows),
        group(
          {},
          inTimeOrder.flatMap((commit) => {
            const point = canvasPoint(commit);
            return point ? commitNode(commit, point, radius, lineWidth, theme) : [];
          }),
        ),
      ],
    };
  },
});
