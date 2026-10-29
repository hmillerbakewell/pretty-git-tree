import { trim } from "../../draw/geometry.ts";
import { element, type Point, polylinePath, type SvgElement } from "../../draw/svg.ts";
import { consecutivePairs } from "../../util/lists.ts";
import { type Board, DEPTH_SWELL, depthBucket, type Painted } from "./board.ts";

const DENSIFY_STEP = 5;
const FLAT_DEPTH_TOLERANCE = 1e-3;

type TwistedPoint = [along: number, across: number, depth: number];

export interface Strand {
  readonly points: Point[];
  readonly colour: string;
  readonly lift: number;
}

const casing = (board: Board, d: string, width: number) =>
  element("path", { d, stroke: board.theme.background, "stroke-width": width, "stroke-linecap": "butt" });

function flatPieces(board: Board, strand: Strand, number: number, twisted: readonly TwistedPoint[]): Painted[] {
  const points = twisted.map(([along, across]) => board.band.toPlane(along, across));
  const cased = trim(points, board.casingTrim);
  const piece = (paint: SvgElement): Painted => ({ depth: strand.lift, strand: number, element: paint });
  return [
    ...(cased ? [piece(casing(board, polylinePath(cased), board.casingWidth))] : []),
    piece(element("path", { d: polylinePath(points), stroke: strand.colour })),
  ];
}

const segmentBucket = (from: TwistedPoint, to: TwistedPoint) => depthBucket((from[2] + to[2]) / 2);

function depthRuns(twisted: readonly TwistedPoint[]): TwistedPoint[][] {
  const runs: TwistedPoint[][] = [];
  for (const [from, to] of consecutivePairs(twisted)) {
    const run = runs.at(-1);
    const runEnd = run?.at(-1);
    const beforeRunEnd = run?.at(-2);
    if (run && runEnd && beforeRunEnd && segmentBucket(beforeRunEnd, runEnd) === segmentBucket(from, to)) run.push(to);
    else runs.push([from, to]);
  }
  return runs;
}

function twistedPieces(board: Board, strand: Strand, number: number, twisted: readonly TwistedPoint[]): Painted[] {
  const { trace } = board.band;
  return depthRuns(twisted).flatMap((run) => {
    const depth = run.reduce((sum, [, , pointDepth]) => sum + pointDepth, 0) / run.length;
    const d = polylinePath(run.map(([along, across]) => board.band.toPlane(along, across)));
    const width = trace * (1 + DEPTH_SWELL * depth);
    const paintedDepth = depth + strand.lift;
    return [
      { depth: paintedDepth, strand: number, element: casing(board, d, width + board.casingWidth - trace) },
      { depth: paintedDepth, strand: number, element: element("path", { d, stroke: strand.colour, "stroke-width": width }) },
    ];
  });
}

export function paintStrand(board: Board, strand: Strand, number: number): Painted[] {
  const dense = board.twist.densify(strand.points, DENSIFY_STEP, board.band.route !== null);
  const twisted = dense.map(([along, across]) => board.twist.map(along, across));
  const passesThroughTwist = twisted.some(([, , depth]) => Math.abs(depth) > FLAT_DEPTH_TOLERANCE);
  return passesThroughTwist ? twistedPieces(board, strand, number, twisted) : flatPieces(board, strand, number, twisted);
}
