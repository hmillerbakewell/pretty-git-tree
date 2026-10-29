import { Band } from "../draw/band.ts";
import type { Twist } from "../draw/embed.ts";
import { arrow } from "../draw/shapes.ts";
import { element, group, type Point, polylinePath, type SvgElement } from "../draw/svg.ts";
import type { Theme } from "../draw/themes.ts";
import { cycle, type Face, firstSide, mergedSide, mergeFaces } from "../graph/faces.ts";
import { defineStyle } from "../style/renderer.ts";
import type { LayoutView, PlacedCommit, PlacedEdge } from "../style/view.ts";
import { clamp } from "../util/maths.ts";

const MATH_FONT = "STIX Two Math, STIX Two Text, Latin Modern Math, Cambria Math, Times New Roman, serif";
const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";
const BRANCH_LETTERS = "ABCDEFGHJKLNPQRSTUVWXYZ";
const TRUNK_LETTER = "M";
const PRIME = "′";
const ROOT_ARROW_LENGTH_IN_RADII = 3;

interface Typesetting {
  readonly named: boolean;
  readonly fontSize: number;
  readonly radius: number;
  readonly stroke: number;
  readonly headLength: number;
}

type Position = (commit: PlacedCommit) => Point;

const subscript = (count: number) => [...String(count)].map((digit) => SUBSCRIPT_DIGITS[Number(digit)]).join("");

function laneLetter(laneIndex: number): string {
  if (laneIndex === 0) return TRUNK_LETTER;
  const branchIndex = laneIndex - 1;
  const letter = BRANCH_LETTERS[branchIndex % BRANCH_LETTERS.length] ?? "";
  return letter + PRIME.repeat(Math.floor(branchIndex / BRANCH_LETTERS.length));
}

function objectNames(view: LayoutView): Map<PlacedCommit, string> {
  const names = new Map<PlacedCommit, string>();
  view.lanes.forEach((lane, laneIndex) => {
    const letter = laneLetter(laneIndex);
    let commitsSoFar = 0;
    for (const commit of lane.commits) {
      commitsSoFar += commit.weight;
      names.set(commit, letter + subscript(commitsSoFar - 1));
    }
  });
  return names;
}

function typesetting(band: Band): Typesetting {
  const preferredFontSize = clamp(band.spacing * 0.34, 11, 26);
  const named = band.unit >= preferredFontSize * 1.9;
  const fontSize = named ? Math.min(preferredFontSize, band.unit * 0.55) : preferredFontSize;
  const stroke = clamp(band.spacing * 0.022, 0.9, 2);
  return {
    named,
    fontSize,
    radius: named ? fontSize * 0.85 : clamp(band.unit * 0.16, 2, 5),
    stroke,
    headLength: stroke * 5.5,
  };
}

function commitPositions(view: LayoutView, band: Band, twist: Twist): Map<string, Point> {
  return new Map(
    view.commits.flatMap((commit): [string, Point][] => {
      const placed = band.pointBySha.get(commit.sha);
      if (!placed) return [];
      const [alongBand, acrossBand] = twist.map(...placed);
      return [[commit.sha, band.toPlane(alongBand, acrossBand)]];
    }),
  );
}

const unitVectorBetween = ([fromX, fromY]: Point, [toX, toY]: Point): Point => {
  const distance = Math.hypot(toX - fromX, toY - fromY) || 1;
  return [(toX - fromX) / distance, (toY - fromY) / distance];
};

function pushoutCorner(merge: Point, mergedSidePoint: Point, firstSidePoint: Point, radius: number): SvgElement {
  const [towardsMergedX, towardsMergedY] = unitVectorBetween(merge, mergedSidePoint);
  const [towardsFirstX, towardsFirstY] = unitVectorBetween(merge, firstSidePoint);
  const [gap, arm] = [radius * 1.7, radius * 0.75];
  const [cornerX, cornerY] = [merge[0] + (towardsMergedX + towardsFirstX) * gap, merge[1] + (towardsMergedY + towardsFirstY) * gap];
  return element("path", {
    d: polylinePath([
      [cornerX + towardsMergedX * arm, cornerY + towardsMergedY * arm],
      [cornerX, cornerY],
      [cornerX + towardsFirstX * arm, cornerY + towardsFirstY * arm],
    ]),
  });
}

interface CommutingSquare {
  readonly tint: SvgElement;
  readonly corner: SvgElement;
}

function commutingSquare(
  face: Face,
  positionBySha: ReadonlyMap<string, Point>,
  colourOf: (sha: string) => string | undefined,
  theme: Theme,
  radius: number,
): CommutingSquare | undefined {
  const merge = positionBySha.get(face.merge);
  const mergedSidePoint = positionBySha.get(mergedSide(face));
  const firstSidePoint = positionBySha.get(firstSide(face));
  const colour = colourOf(mergedSide(face));
  const cycleShas = cycle(face);
  const outline = cycleShas.map((sha) => positionBySha.get(sha)).filter((point) => point !== undefined);
  if (!merge || !mergedSidePoint || !firstSidePoint || !colour || outline.length < cycleShas.length) return undefined;
  return {
    tint: element("path", { d: `${polylinePath(outline)} Z`, fill: colour, "fill-opacity": theme.glow ? 0.1 : 0.14, stroke: "none" }),
    corner: pushoutCorner(merge, mergedSidePoint, firstSidePoint, radius),
  };
}

function changeArrow(edge: PlacedEdge, position: Position, band: Band, twist: Twist, theme: Theme, sizes: Typesetting): SvgElement[] {
  const { radius, stroke, headLength } = sizes;
  if (edge.parent) return arrow(position(edge.parent), position(edge.child), theme.ink, stroke, headLength, [radius, radius + stroke]);
  const acrossBand = band.pointBySha.get(edge.child.sha)?.[1] ?? band.middleAcross;
  const [alongBand, twistedAcross] = twist.map(band.timeAxisStart - radius * ROOT_ARROW_LENGTH_IN_RADII, acrossBand);
  return arrow(band.toPlane(alongBand, twistedAcross), position(edge.child), theme.muted, stroke, headLength, [0, radius]);
}

function commitObject(commit: PlacedCommit, [x, y]: Point, name: string, theme: Theme, sizes: Typesetting): SvgElement[] {
  const { named, fontSize, radius, stroke } = sizes;
  const mark = named
    ? [
        element(
          "text",
          { x, y, dy: "0.35em", "text-anchor": "middle", "font-family": MATH_FONT, "font-style": "italic", "font-size": fontSize, fill: theme.ink },
          [name],
        ),
      ]
    : [
        element("circle", { cx: x, cy: y, r: radius, fill: theme.ink }),
        ...(commit.isMerge ? [element("circle", { cx: x, cy: y, r: radius * 1.9, fill: "none", stroke: theme.ink, "stroke-width": stroke })] : []),
      ];
  const headMarker = element("circle", {
    cx: x,
    cy: y,
    r: radius * 1.9 + 4,
    fill: "none",
    stroke: theme.muted,
    "stroke-width": stroke,
    "stroke-dasharray": "2 3",
  });
  return commit.isHead ? [...mark, headMarker] : mark;
}

export const commutative = defineStyle({
  name: "commutative",
  description: "Dual view: commits as objects, changes as arrows, merges as pushout squares.",
  tunes: ["arrange", "twistEvery"],

  draw({ graph, frame, theme, view }) {
    const band = new Band(view.layout, frame);
    const twist = band.twist();
    const sizes = typesetting(band);
    const positionBySha = commitPositions(view, band, twist);
    const position: Position = (commit) => positionBySha.get(commit.sha) ?? [0, 0];
    const commitBySha = new Map(view.commits.map((commit) => [commit.sha, commit]));
    const colourOf = (sha: string) => commitBySha.get(sha)?.colour;
    const squares = mergeFaces(graph).flatMap((face) => commutingSquare(face, positionBySha, colourOf, theme, sizes.radius) ?? []);
    const names = objectNames(view);
    return {
      layers: [
        group(
          {},
          squares.map((square) => square.tint),
        ),
        group(
          {},
          view.edges.flatMap((edge) => changeArrow(edge, position, band, twist, theme, sizes)),
        ),
        group(
          { stroke: theme.ink, "stroke-width": sizes.stroke, fill: "none", "stroke-linecap": "round" },
          squares.map((square) => square.corner),
        ),
        group(
          {},
          view.commits.flatMap((commit) => commitObject(commit, position(commit), names.get(commit) ?? "", theme, sizes)),
        ),
      ],
      headingFont: MATH_FONT,
    };
  },
});
