import { Band, fillFit } from "../draw/band.ts";
import type { Frame } from "../draw/frame.ts";
import { glowFilter } from "../draw/marks.ts";
import { element, group, type Point, type SvgElement } from "../draw/svg.ts";
import type { Theme } from "../draw/themes.ts";
import type { Options } from "../model.ts";
import { defineStyle } from "../style/renderer.ts";
import type { LayoutView, PlacedEdge, PlacedLane } from "../style/view.ts";
import { type Board, commitPlace, paintingOrder } from "./circuit/board.ts";
import { commitMark } from "./circuit/parts.ts";
import { paintStrand, type Strand } from "./circuit/strands.ts";

const INSET_PER_VIA = 2.5;
const CASING_PER_TRACE = 2.6;
const CASING_TRIM_PER_VIA = 1.6;
const BEND_LIFT = 0.002;
const OUTPUT_REACH_PER_VIA = 2;
const INPUT_PAD_PER_VIA = 1.3;
const INPUT_PAD_CORNER = 0.15;
const INPUT_PAD_STROKE_PER_TRACE = 0.8;
const OUTPUT_PAD_PER_VIA = 1.6;
const OUTPUT_PAD_CORNER = 0.2;

function boardOf(view: LayoutView, frame: Frame, theme: Theme, options: Options): Board {
  const band = new Band(view.layout, frame, options.route === "fill" ? fillFit(view.layout, frame) : undefined);
  return {
    band,
    twist: band.twist(),
    theme,
    vertical: frame.vertical,
    inset: band.viaRadius * INSET_PER_VIA,
    casingWidth: band.trace * CASING_PER_TRACE,
    casingTrim: band.viaRadius * CASING_TRIM_PER_VIA,
  };
}

function edgeStrand(board: Board, edge: PlacedEdge): Strand {
  const owner = edge.kind === "merge" ? (edge.parent ?? edge.child) : edge.child;
  const bandEdge = { parent: edge.parent?.sha ?? null, child: edge.child.sha, kind: edge.kind };
  return { points: board.band.edgePoints(bandEdge, board.inset), colour: owner.colour, lift: edge.kind === "line" ? 0 : BEND_LIFT };
}

const outputEnd = (board: Board): number => board.band.timeAxisEnd + board.band.viaRadius * OUTPUT_REACH_PER_VIA;

function outputStrand(board: Board, lane: PlacedLane): Strand[] {
  const last = lane.commits.at(-1);
  if (!lane.continuesAfterRange || !last) return [];
  const [lastAlong] = commitPlace(board.band, last);
  const across = board.band.acrossAt(lane.slot);
  return [
    {
      points: [
        [lastAlong, across],
        [outputEnd(board), across],
      ],
      colour: lane.colour,
      lift: 0,
    },
  ];
}

function laneEndPoint(board: Board, lane: PlacedLane, along: number): Point {
  const [twistedAlong, twistedAcross] = board.twist.map(along, board.band.acrossAt(lane.slot));
  return board.band.toPlane(twistedAlong, twistedAcross);
}

function inputPad(board: Board, lane: PlacedLane): SvgElement {
  const [x, y] = laneEndPoint(board, lane, board.band.timeAxisStart - board.inset);
  const size = board.band.viaRadius * INPUT_PAD_PER_VIA;
  return element("rect", {
    x: x - size / 2,
    y: y - size / 2,
    width: size,
    height: size,
    rx: size * INPUT_PAD_CORNER,
    fill: board.theme.background,
    stroke: lane.colour,
    "stroke-width": board.band.trace * INPUT_PAD_STROKE_PER_TRACE,
  });
}

function outputPad(board: Board, lane: PlacedLane): SvgElement {
  const [x, y] = laneEndPoint(board, lane, outputEnd(board));
  const size = board.band.viaRadius * OUTPUT_PAD_PER_VIA;
  return element("rect", { x: x - size / 2, y: y - size / 2, width: size, height: size, rx: size * OUTPUT_PAD_CORNER, fill: lane.colour });
}

const lanePads = (board: Board, lane: PlacedLane): SvgElement[] => [
  ...(lane.entersFromBeforeRange ? [inputPad(board, lane)] : []),
  ...(lane.continuesAfterRange ? [outputPad(board, lane)] : []),
];

export const circuit = defineStyle({
  name: "circuit",
  description: "Branches as PCB traces: vias, chips, 45-degree bends.",
  tunes: ["arrange", "route", "twistEvery"],
  showsGrid: true,

  draw({ frame, theme, options, view }) {
    const board = boardOf(view, frame, theme, options);
    const strands = [...view.edges.map((edge) => edgeStrand(board, edge)), ...view.lanes.flatMap((lane) => outputStrand(board, lane))];
    const wires = strands.flatMap((strand, index) => paintStrand(board, strand, index + 1));
    const painted = [...wires, ...view.commitsInTimeOrder.map((commit) => commitMark(board, commit))];
    const traceStyle = { fill: "none", "stroke-width": board.band.trace, "stroke-linecap": "round", "stroke-linejoin": "round" };
    return {
      layers: [
        group(
          { ...traceStyle, ...glowFilter(theme) },
          painted.sort(paintingOrder).map((piece) => piece.element),
        ),
        group(
          {},
          view.lanes.flatMap((lane) => lanePads(board, lane)),
        ),
      ],
    };
  },
});
