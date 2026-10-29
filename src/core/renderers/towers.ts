import { mix } from "../draw/colour.ts";
import { element, formatNumber, group, type Point, polylinePath, type SvgElement } from "../draw/svg.ts";
import type { Theme } from "../draw/themes.ts";
import { defineStyle } from "../style/renderer.ts";
import type { LayoutView, PlacedLane } from "../style/view.ts";
import { GROUND_TILT, type Projection, projectionOf, TOWER_RADIUS, type Tower, towersOf } from "./towers/plan.ts";
import { type Piece, walkwayPieces } from "./towers/walkways.ts";

const GROUND_SHADE = 0.05;
const STILT_PALENESS = 0.3;
const STILT_WIDTH_PER_RADIUS = 0.12;
const OUTLINE_DARKNESS = 0.5;
const OUTLINE_WIDTH = 0.6;
const ROOF_LIGHTNESS = 0.3;
const FLOOR_LINE_OPACITY = 0.4;
const STACKING_DEPTH_PER_HEIGHT = 1e-3;
const HEAD_DOT_PER_RADIUS = 0.25;
const SMALLEST_HEAD_DOT = 3;

interface Scene {
  readonly towers: readonly Tower[];
  readonly projection: Projection;
  readonly theme: Theme;
  readonly wallPaint: ReadonlyMap<string, string>;
}

const wallPaintId = (index: number) => `side${index}`;

const distinctColours = (towers: readonly Tower[]): string[] => [...new Set(towers.map((tower) => tower.lane.colour))];

const wallGradient = (colour: string, index: number): SvgElement =>
  element("linearGradient", { id: wallPaintId(index), x1: 0, y1: 0, x2: 1, y2: 0 }, [
    element("stop", { offset: "0%", "stop-color": mix(colour, "#ffffff", 0.18) }),
    element("stop", { offset: "45%", "stop-color": colour }),
    element("stop", { offset: "100%", "stop-color": mix(colour, "#000000", 0.4) }),
  ]);

function stilt(tower: Tower, scene: Scene): SvgElement[] {
  if (tower.bottom <= 0) return [];
  const { screen, elevation, towerRadius } = scene.projection;
  const [x, y] = tower.site;
  const plotFloor = Math.max(0, ...scene.towers.filter((other) => other.lane.slot === tower.lane.slot && other.top <= tower.bottom).map((other) => other.top));
  return [
    element("path", {
      d: polylinePath([screen(x, y, elevation(plotFloor)), screen(x, y, elevation(tower.bottom))]),
      stroke: mix(tower.lane.colour, scene.theme.background, STILT_PALENESS),
      "stroke-width": Math.max(1, towerRadius * STILT_WIDTH_PER_RADIUS),
    }),
  ];
}

const arcRoundTheFront = (centreX: number, y: number, radius: number): string =>
  `A${formatNumber(radius)},${formatNumber(radius * GROUND_TILT)} 0 0 0 ${formatNumber(centreX + radius)},${formatNumber(y)}`;

const frontArc = (centreX: number, y: number, radius: number): string =>
  `M${formatNumber(centreX - radius)},${formatNumber(y)} ${arcRoundTheFront(centreX, y, radius)}`;

const wallOutline = (centreX: number, base: number, roof: number, radius: number): string =>
  `M${formatNumber(centreX - radius)},${formatNumber(roof)} L${formatNumber(centreX - radius)},${formatNumber(base)} ${arcRoundTheFront(centreX, base, radius)} L${formatNumber(centreX + radius)},${formatNumber(roof)} Z`;

function towerBody(tower: Tower, scene: Scene): SvgElement[] {
  const { screen, elevation, towerRadius: radius } = scene.projection;
  const [siteX, siteY] = tower.site;
  const [x, base] = screen(siteX, siteY, elevation(tower.bottom));
  const [, roof] = screen(siteX, siteY, elevation(tower.top));
  const outline = mix(tower.lane.colour, "#000000", OUTLINE_DARKNESS);
  const floorLines = tower.lane.commits.map((commit) => element("path", { d: frontArc(x, screen(siteX, siteY, elevation(commit.timeFraction))[1], radius) }));
  return [
    element("path", {
      d: wallOutline(x, base, roof, radius),
      fill: scene.wallPaint.get(tower.lane.colour),
      stroke: outline,
      "stroke-width": OUTLINE_WIDTH,
    }),
    group({ stroke: scene.theme.background, "stroke-width": OUTLINE_WIDTH, opacity: FLOOR_LINE_OPACITY, fill: "none" }, floorLines),
    element("ellipse", {
      cx: x,
      cy: roof,
      rx: radius,
      ry: radius * GROUND_TILT,
      fill: mix(tower.lane.colour, "#ffffff", ROOF_LIGHTNESS),
      stroke: outline,
      "stroke-width": OUTLINE_WIDTH,
    }),
  ];
}

const towerPiece = (tower: Tower, scene: Scene): Piece => ({
  depth: tower.site[1] + tower.bottom * STACKING_DEPTH_PER_HEIGHT,
  elements: [...stilt(tower, scene), ...towerBody(tower, scene)],
});

function headPiece(view: LayoutView, towerOfLane: ReadonlyMap<PlacedLane, Tower>, scene: Scene): Piece[] {
  const head = view.commits.find((commit) => commit.isHead);
  const tower = head && towerOfLane.get(head.lane);
  if (!head || !tower) return [];
  const { screen, elevation, towerRadius } = scene.projection;
  const front: Point = [tower.site[0], tower.site[1] + TOWER_RADIUS];
  const [x, y] = screen(...front, elevation(head.timeFraction));
  const dot = element("circle", {
    cx: x,
    cy: y,
    r: Math.max(SMALLEST_HEAD_DOT, towerRadius * HEAD_DOT_PER_RADIUS),
    fill: scene.theme.ink,
    stroke: scene.theme.background,
    "stroke-width": 1,
  });
  return [{ depth: front[1], elements: [dot] }];
}

function ground(projection: Projection, theme: Theme): SvgElement {
  const { centre, radiusX, radiusY } = projection.ground;
  return element("ellipse", { cx: centre[0], cy: centre[1], rx: radiusX, ry: radiusY, fill: mix(theme.background, theme.ink, GROUND_SHADE) });
}

export const towers = defineStyle({
  name: "towers",
  description: "Branches as round towers, time as height; forks and merges as walkways between them.",
  tunes: ["arrange"],

  draw({ frame, theme, view }) {
    if (view.commits.length === 0) return { layers: [] };
    const floorHeight = 1 / view.commits.length;
    const standing = towersOf(view, frame, floorHeight);
    const projection = projectionOf(standing, frame);
    const colours = distinctColours(standing);
    const wallPaint = new Map(colours.map((colour, index) => [colour, `url(#${wallPaintId(index)})`]));
    const scene: Scene = { towers: standing, projection, theme, wallPaint };
    const towerOfLane = new Map(standing.map((tower) => [tower.lane, tower]));
    const walkwayScene = { towers: standing, towerOfLane, projection, theme, floorHeight };
    const pieces = [
      ...standing.map((tower) => towerPiece(tower, scene)),
      ...view.edges.flatMap((edge) => walkwayPieces(walkwayScene, edge)),
      ...headPiece(view, towerOfLane, scene),
    ];
    return {
      layers: [
        ground(projection, theme),
        group(
          {},
          pieces.sort((a, b) => a.depth - b.depth).flatMap((piece) => piece.elements),
        ),
      ],
      definitions: colours.map(wallGradient),
    };
  },
});
