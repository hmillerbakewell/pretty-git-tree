import { glowFilter } from "../../draw/marks.ts";
import { element, group, polylinePath, type SvgElement } from "../../draw/svg.ts";
import { clamp } from "../../util/maths.ts";
import { seededRandom } from "../../util/random.ts";
import { closedLine, type Harmonics, type Section, wiggle, woodTone } from "./section.ts";

const RING_LINE_WOBBLE_SHARE = 0.22;
const HEARTWOOD_REACH = 0.55;
const SHADE_SEED_SALT = 0x5bd1e995;
const PIXELS_PER_EARLYWOOD_LINE = 10;
const MOST_EARLYWOOD_LINES = 2;

export interface Wood {
  readonly definitions: SvgElement[];
  readonly layers: SvgElement[];
}

interface GrowthRing {
  readonly definition: SvgElement;
  readonly fill: SvgElement;
  readonly latewood: SvgElement[];
  readonly earlywood: SvgElement[];
}

export function ringStrays(grain: () => number, radii: readonly number[]): Harmonics[] {
  const widthOf = (ring: number) => radii[ring + 1] - radii[ring];
  const outermost = radii.length - 1;
  return radii.map((_, boundary) => {
    const own = wiggle(grain, 3, 9);
    const amplitude = boundary === 0 || boundary === outermost ? 0 : RING_LINE_WOBBLE_SHARE * Math.min(widthOf(boundary - 1), widthOf(boundary));
    return (angle: number) => amplitude * own(angle);
  });
}

function ringLine(section: Section, strays: readonly Harmonics[], boundary: number, towardsNext = 0) {
  const radii = section.growth.radii;
  return closedLine(
    section,
    (angle) => {
      const inner = radii[boundary] + strays[boundary](angle);
      return towardsNext ? inner + (radii[boundary + 1] + strays[boundary + 1](angle) - inner) * towardsNext : inner;
    },
    radii[boundary],
  );
}

function growthRing(section: Section, strays: readonly Harmonics[], outerBoundary: number, shadeDraw: number): GrowthRing {
  const { growth, disc, unit, theme } = section;
  const ring = outerBoundary - 1;
  const isHeartwood = growth.radii[ring] < HEARTWOOD_REACH ? 1 : 0;
  const share = (theme.glow ? 0.05 + 0.03 * isHeartwood : 0.025 + 0.035 * isHeartwood) + 0.015 * shadeDraw;
  const id = `ring${outerBoundary}`;
  const ringPixels = (growth.radii[outerBoundary] - growth.radii[ring]) * disc.radius;
  const isBark = outerBoundary === growth.radii.length - 1;
  const earlywoodLines = Math.min(MOST_EARLYWOOD_LINES, Math.floor(ringPixels / (PIXELS_PER_EARLYWOOD_LINE * unit)));
  return {
    definition: element("path", { id, d: `${polylinePath(ringLine(section, strays, outerBoundary))} Z` }),
    fill: element("use", { href: `#${id}`, fill: woodTone(theme, share) }),
    latewood: isBark ? [] : [element("use", { href: `#${id}`, "stroke-width": clamp(ringPixels * 0.14, 0.7 * unit, 3.2 * unit) })],
    earlywood: Array.from({ length: earlywoodLines }, (_, line) =>
      element("path", { d: `${polylinePath(ringLine(section, strays, ring, (line + 1) / (earlywoodLines + 1)))} Z` }),
    ),
  };
}

function shadow(section: Section): SvgElement {
  const { disc, theme } = section;
  const [centreX, centreY] = disc.centre;
  return element("ellipse", {
    cx: centreX,
    cy: centreY + disc.radius * 0.03,
    rx: disc.radiusX * 1.06,
    ry: disc.radiusY * 1.06,
    fill: "#000000",
    opacity: theme.glow ? 0.35 : 0.07,
  });
}

export function wood(section: Section, strays: readonly Harmonics[], seed: number): Wood {
  const { growth, unit, theme } = section;
  const shade = seededRandom(seed ^ SHADE_SEED_SALT);
  const outsideIn = Array.from({ length: growth.radii.length - 1 }, (_, index) => growth.radii.length - 1 - index);
  const rings = outsideIn.map((outerBoundary) => growthRing(section, strays, outerBoundary, shade()));
  return {
    definitions: rings.map((ring) => ring.definition),
    layers: [
      group({}, [shadow(section)]),
      group(
        {},
        rings.map((ring) => ring.fill),
      ),
      group(
        { fill: "none", stroke: woodTone(theme, theme.glow ? 0.22 : 0.4), "stroke-width": 0.5 * unit, "stroke-linejoin": "round" },
        rings.flatMap((ring) => ring.earlywood),
      ),
      group(
        { fill: "none", stroke: woodTone(theme, theme.glow ? 0.62 : 0.8), "stroke-linejoin": "round", ...glowFilter(theme) },
        rings.flatMap((ring) => ring.latewood),
      ),
    ],
  };
}
