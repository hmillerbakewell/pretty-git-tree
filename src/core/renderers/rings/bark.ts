import { glowFilter } from "../../draw/marks.ts";
import { element, group, polylinePath, type SvgElement } from "../../draw/svg.ts";
import type { PlacedCommit } from "../../style/view.ts";
import { clamp } from "../../util/maths.ts";
import { seededRandom } from "../../util/random.ts";
import { PITH_REACH } from "./growth.ts";
import { closedLine, knotDark, type Section, woodTone } from "./section.ts";

const ROUGH_SEED_SALT = 0x9e3779b9;
const PIXELS_PER_FISSURE = 11;
const BLAZE_SAMPLES = 13;
const PITH_DRAWN_SHARE = 0.6;

export const barkWidth = ({ disc, unit }: Section): number => clamp(disc.radius * 0.04, 4 * unit, 16 * unit);

function barkBand(section: Section, rough: () => number): SvgElement {
  const width = barkWidth(section);
  const reachOverDisc = width / 2 / section.disc.radius;
  let drift = 0;
  const outline = closedLine(
    section,
    () => {
      drift = 0.6 * drift + (rough() - 0.5) * 0.5;
      return 1 + reachOverDisc * (1 + drift * 0.6);
    },
    1,
  );
  return group({}, [
    element("path", {
      d: `${polylinePath(outline)} Z`,
      fill: "none",
      stroke: woodTone(section.theme, section.theme.glow ? 0.3 : 0.75),
      "stroke-width": width,
      "stroke-linejoin": "round",
    }),
  ]);
}

function fissure(section: Section, rough: () => number, index: number, fissureCount: number): SvgElement {
  const { disc, flowAroundKnots } = section;
  const widthOverDisc = barkWidth(section) / disc.radius;
  const angle = ((index + rough() * 0.6) * 2 * Math.PI) / fissureCount;
  const lean = (rough() - 0.5) * 0.03;
  const innerReach = 1 + widthOverDisc * (0.1 + 0.4 * rough());
  const outerReach = 1 + widthOverDisc * (0.9 - 0.3 * rough());
  return element("path", { d: polylinePath([flowAroundKnots(disc.pointAt(innerReach, angle)), flowAroundKnots(disc.pointAt(outerReach, angle + lean))]) });
}

function fissures(section: Section, rough: () => number): SvgElement {
  const { disc, unit, theme } = section;
  const fissureCount = Math.round((2 * Math.PI * Math.max(disc.radiusX, disc.radiusY)) / (PIXELS_PER_FISSURE * unit));
  return group(
    { stroke: theme.background, "stroke-width": 1.1 * unit, "stroke-linecap": "round", opacity: 0.85 },
    Array.from({ length: fissureCount }, (_, index) => fissure(section, rough, index, fissureCount)),
  );
}

export function bark(section: Section, seed: number): SvgElement[] {
  const rough = seededRandom(seed ^ ROUGH_SEED_SALT);
  const band = barkBand(section, rough);
  return [band, fissures(section, rough)];
}

export function pith({ disc, theme }: Section): SvgElement {
  const [centreX, centreY] = disc.centre;
  const [offsetX, offsetY] = disc.pithOffset;
  return element("ellipse", {
    cx: centreX + offsetX,
    cy: centreY + offsetY,
    rx: PITH_REACH * disc.radiusX * PITH_DRAWN_SHARE,
    ry: PITH_REACH * disc.radiusY * PITH_DRAWN_SHARE,
    fill: knotDark(theme),
  });
}

function blazeMarks(section: Section, head: PlacedCommit): SvgElement[] {
  const { disc, growth, sectors, unit, theme } = section;
  const width = barkWidth(section);
  const angle = sectors.angleOf(head.slot);
  const barkReach = 1 + width / 2 / disc.radius;
  const halfArc = (width * 1.6) / disc.radius;
  const arc = Array.from({ length: BLAZE_SAMPLES }, (_, sample) => disc.pointAt(barkReach, angle - halfArc + (2 * halfArc * sample) / (BLAZE_SAMPLES - 1)));
  const [headX, headY] = disc.pointAt(growth.reachAt(head.timeFraction), angle);
  return [
    element("path", { d: polylinePath(arc), fill: "none", stroke: head.colour, "stroke-width": width * 1.15, "stroke-linecap": "round" }),
    element("circle", {
      cx: headX,
      cy: headY,
      r: 7 * unit,
      fill: "none",
      stroke: theme.ink,
      "stroke-width": 1.2 * unit,
      "stroke-dasharray": `${(2 * unit).toFixed(2)} ${(3 * unit).toFixed(2)}`,
    }),
  ];
}

export const headBlaze = (section: Section, head: PlacedCommit | undefined): SvgElement =>
  group(glowFilter(section.theme), head ? blazeMarks(section, head) : []);
