import {
  ARRANGEMENTS,
  type Arrangement,
  DEFAULT_FORMAT,
  FORMATS,
  getRenderer,
  isOneOf,
  LEVELS,
  type Level,
  ROUTES,
  type RouteKind,
  THEMES,
  TIME_MODES,
  type TimeMode,
  type Tune,
} from "../core/index.ts";

export interface Choice<T extends string = string> {
  readonly id: T;
  readonly label?: string;
  readonly swatch?: readonly string[];
  readonly ratio?: readonly [number, number];
}

export const TWISTS = ["off", "10", "25", "50"] as const;

export type Twists = (typeof TWISTS)[number];

export interface Settings {
  readonly style: string;
  readonly arrange: Arrangement;
  readonly route: RouteKind;
  readonly twists: Twists;
  readonly theme: string;
  readonly format: string;
  readonly level: Level;
  readonly time: TimeMode;
}

export const DIMENSIONS = ["style", "arrange", "route", "twists", "theme", "format", "level", "time"] as const satisfies readonly (keyof Settings)[];

export type Dim = (typeof DIMENSIONS)[number];

export const DIM_LABELS: Readonly<Record<Dim, string>> = {
  style: "Style",
  arrange: "Trunk",
  route: "Ribbon",
  twists: "Twist every",
  theme: "Theme",
  format: "Format",
  level: "Detail",
  time: "Time",
};

export interface Layout extends Pick<Settings, "style" | FineDim> {
  readonly id: string;
  readonly label: string;
}

const ARCHES: Layout = {
  id: "arches",
  label: "Arches",
  style: "arcs",
  arrange: "centre",
  route: "straight",
  twists: "off",
  level: "full",
  time: "chronological",
};

export const LAYOUTS: readonly Layout[] = [
  ARCHES,
  { id: "delta", label: "Delta", style: "delta", arrange: "centre", route: "straight", twists: "off", level: "full", time: "topological" },
  { id: "particles", label: "Particles", style: "feynman", arrange: "centre", route: "straight", twists: "off", level: "fused", time: "topological" },
  { id: "qubits", label: "Qubits", style: "qubits", arrange: "centre", route: "fill", twists: "off", level: "full", time: "topological" },
];

export const OPTIONS: { readonly [D in Dim]: readonly Choice<Settings[D]>[] } = {
  style: LAYOUTS.map(({ style }) => ({ id: style, label: getRenderer(style).description })),
  arrange: ARRANGEMENTS.map((id) => ({ id })),
  route: ROUTES.map((id) => ({ id, label: id === "fill" ? "ribbon winds through the frame" : "ribbon runs straight" })),
  twists: TWISTS.map((id) => ({ id, label: id === "off" ? "no twists" : `a half-twist every ${id} commits` })),
  theme: Object.values(THEMES).map((t) => ({ id: t.name, swatch: [t.background, ...t.palette.slice(0, 3)] })),
  format: Object.entries(FORMATS).map(([id, c]) => ({ id, ratio: [c.width, c.height] })),
  level: LEVELS.map((id) => ({ id })),
  time: TIME_MODES.map((id) => ({ id })),
};

export const DEFAULTS: Settings = {
  style: ARCHES.style,
  arrange: OPTIONS.arrange[0].id,
  route: OPTIONS.route[0].id,
  twists: OPTIONS.twists[0].id,
  theme: OPTIONS.theme[0].id,
  format: DEFAULT_FORMAT,
  level: OPTIONS.level[0].id,
  time: OPTIONS.time[0].id,
};

const pick = <T extends string>(choices: readonly Choice<T>[], value: unknown, fallback: T): T =>
  isOneOf(
    choices.map((c) => c.id),
    value,
  )
    ? value
    : fallback;

export const validSettings = (untrusted: Readonly<Partial<Record<Dim, unknown>>>): Settings => ({
  style: pick(OPTIONS.style, untrusted.style, DEFAULTS.style),
  arrange: pick(OPTIONS.arrange, untrusted.arrange, DEFAULTS.arrange),
  route: pick(OPTIONS.route, untrusted.route, DEFAULTS.route),
  twists: pick(OPTIONS.twists, untrusted.twists, DEFAULTS.twists),
  theme: pick(OPTIONS.theme, untrusted.theme, DEFAULTS.theme),
  format: pick(OPTIONS.format, untrusted.format, DEFAULTS.format),
  level: pick(OPTIONS.level, untrusted.level, DEFAULTS.level),
  time: pick(OPTIONS.time, untrusted.time, DEFAULTS.time),
});

export const withSetting = <D extends Dim>(settings: Settings, dim: D, value: Settings[D]): Settings => ({ ...settings, [dim]: value });

export const variants = <D extends Dim>(settings: Settings, dim: D): Settings[] => OPTIONS[dim].map((option) => withSetting(settings, dim, option.id));

const FINE_TUNES = [
  ["twistEvery", "twists"],
  ["arrange", "arrange"],
  ["route", "route"],
] as const satisfies readonly (readonly [Tune, Dim])[];

export type FineDim = (typeof FINE_TUNES)[number][1] | "level" | "time";

export const FINE_DIMS: readonly FineDim[] = [...FINE_TUNES.map(([, dim]) => dim), "level", "time"];

export const tunable = (style: string): readonly FineDim[] => {
  const { tunes } = getRenderer(style);
  return [...FINE_TUNES.filter(([tune]) => tunes.includes(tune)).map(([, dim]) => dim), "level", "time"];
};

export const layoutOf = (settings: Settings): Layout | undefined => LAYOUTS.find((layout) => layout.style === settings.style);

export const withLayout = (settings: Settings, { id, label, ...layoutSettings }: Layout): Settings => ({ ...settings, ...layoutSettings });

export const onLayout = (settings: Settings): Settings => (layoutOf(settings) ? settings : withLayout(settings, ARCHES));

export const LAYOUT_DEFAULTS: Settings = withLayout(DEFAULTS, ARCHES);
