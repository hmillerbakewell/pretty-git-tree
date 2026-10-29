import { mix } from "../../draw/colour.ts";
import { element, type SvgElement } from "../../draw/svg.ts";
import type { Theme } from "../../draw/themes.ts";
import type { Drawdown } from "./drawdown.ts";
import { boxAt, type Loom, toScreen } from "./loom.ts";

const ASLEEP_TINT = 0.2;
const LIFT_SHINE = 0.3;
const THREAD_INSET = 0.09;
const THREAD_OVERLAP = 0.02;
const THREAD_ROUNDING = 0.35;
const WARP_SHEEN_ID = "sheen-warp";
const WEFT_SHEEN_ID = "sheen-weft";

export interface PatternBook {
  readonly fillAt: (row: number, end: number) => string;
  readonly definitions: () => SvgElement[];
}

type WarpUp = (along: number, across: number) => boolean;

export const weftColour = (theme: Theme) => mix(theme.background, theme.ink, theme.glow ? 0.16 : 0.1);

function sheen(id: string, runsAlong: boolean, loom: Loom, theme: Theme): SvgElement {
  const shadesAcrossX = loom.vertical ? runsAlong : !runsAlong;
  return element("linearGradient", { id, x1: 0, y1: 0, x2: shadesAcrossX ? 1 : 0, y2: shadesAcrossX ? 0 : 1 }, [
    element("stop", { offset: "0%", "stop-color": "#000000", "stop-opacity": 0.35 }),
    element("stop", { offset: "38%", "stop-color": "#ffffff", "stop-opacity": theme.glow ? 0.22 : 0.3 }),
    element("stop", { offset: "60%", "stop-color": "#ffffff", "stop-opacity": 0.05 }),
    element("stop", { offset: "100%", "stop-color": "#000000", "stop-opacity": 0.4 }),
  ]);
}

function thread(loom: Loom, along: number, across: number, colour: string, warpUp: boolean): SvgElement[] {
  const { rowPitch, endPitch } = loom;
  const [alongInset, acrossInset] = warpUp ? [rowPitch * THREAD_OVERLAP, endPitch * THREAD_INSET] : [rowPitch * THREAD_INSET, endPitch * THREAD_OVERLAP];
  const box = boxAt(loom, along * rowPitch + alongInset, across * endPitch + acrossInset, rowPitch - 2 * alongInset, endPitch - 2 * acrossInset);
  const rx = Math.min(box.width, box.height) * THREAD_ROUNDING;
  return [element("rect", { ...box, rx, fill: colour }), element("rect", { ...box, rx, fill: `url(#${warpUp ? WARP_SHEEN_ID : WEFT_SHEEN_ID})` })];
}

function patternTile(
  id: string,
  loom: Loom,
  repeat: [along: number, across: number],
  warpUp: WarpUp,
  colours: [warp: string, weft: string],
  shadow: string,
): SvgElement {
  const [alongRepeat, acrossRepeat] = repeat;
  const size = boxAt(loom, 0, 0, alongRepeat * loom.rowPitch, acrossRepeat * loom.endPitch);
  const [x, y] = toScreen(loom, loom.clothStart, loom.firstEnd);
  const threads = Array.from({ length: alongRepeat }, (_, along) =>
    Array.from({ length: acrossRepeat }, (_, across) => {
      const up = warpUp(along, across);
      return thread(loom, along, across, up ? colours[0] : colours[1], up);
    }),
  ).flat(2);
  return element("pattern", { id, patternUnits: "userSpaceOnUse", x, y, width: size.width, height: size.height }, [
    element("rect", { ...size, fill: shadow }),
    ...threads,
  ]);
}

export function patternBook(loom: Loom, drawdown: Drawdown, theme: Theme): PatternBook {
  const tiles = new Map<string, { readonly fill: string; readonly tile: SvgElement }>();
  const shadow = mix(theme.background, "#000000", theme.glow ? 0.55 : 0.35);
  const weft = weftColour(theme);
  const pattern = (key: string, repeat: [number, number], warpUp: WarpUp, warpColour: string, weftThread: string): string => {
    const known = tiles.get(key);
    if (known) return known.fill;
    const id = `w${tiles.size}`;
    tiles.set(key, { fill: `url(#${id})`, tile: patternTile(id, loom, repeat, warpUp, [warpColour, weftThread], shadow) });
    return `url(#${id})`;
  };
  const fillAt = (row: number, end: number): string => {
    const warp = loom.ends[end] ?? { slot: undefined, colour: loom.groundColour };
    switch (drawdown.stateAt(row, end)) {
      case "lifted":
        return pattern(`L${warp.colour}`, [1, 1], () => true, mix(warp.colour, theme.ink, LIFT_SHINE), weft);
      case "float": {
        const floatColour = drawdown.floatColourAt(row, end) ?? weft;
        return pattern(`F${floatColour}`, [1, 1], () => false, warp.colour, floatColour);
      }
      case "alive":
        return pattern(`A${warp.colour}`, [4, 4], (along, across) => (along + across) % 4 < 2, warp.colour, weft);
      default: {
        const tinted = warp.slot === undefined ? warp.colour : mix(loom.groundColour, warp.colour, ASLEEP_TINT);
        return pattern(`D${tinted}`, [2, 2], (along, across) => (along + across) % 2 === 0, tinted, weft);
      }
    }
  };
  return {
    fillAt,
    definitions: () => [sheen(WARP_SHEEN_ID, true, loom, theme), sheen(WEFT_SHEEN_ID, false, loom, theme), ...[...tiles.values()].map(({ tile }) => tile)],
  };
}
