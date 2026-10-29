import { element, formatNumber, type Point, polylinePath, type SvgElement } from "../../draw/svg.ts";
import type { Theme } from "../../draw/themes.ts";
import type { PlacedCommit } from "../../style/view.ts";
import { clamp } from "../../util/maths.ts";
import type { PlacedGate } from "../qubits.ts";
import { type Systems, staffTop, stepY, systemOf, xAt } from "./systems.ts";

const WHOLE = 0;
const HALF = 1;
const QUARTER = 2;
const EIGHTH = 3;
const SIXTEENTH = 4;
const SECONDS_PER_HOUR = 3600;
const NOTE_VALUE_BY_LONGEST_WAIT_IN_HOURS: readonly (readonly [hours: number, value: number])[] = [
  [0.25, SIXTEENTH],
  [2, EIGHTH],
  [12, QUARTER],
  [72, HALF],
];
const LOWEST_PITCH_STEP = -2;
const PITCH_STEPS_ACROSS_THE_DAY = 12;
const LAST_HOUR = 23;
const LARGEST_CHORD = 3;
const STEPS_BETWEEN_CHORD_NOTES = 2;
const BOTTOM_LEDGER_STEP = -2;
const TOP_LEDGER_STEP = 10;
const MIDDLE_LINE_STEP = 4;
const LEDGER_HALF_WIDTH = 1;
const LEDGER_OPACITY = 0.8;
const HEAD_RADIUS_ACROSS = 0.62;
const HEAD_RADIUS_UP = 0.43;
const HEAD_TILT_DEGREES = -22;
const OPEN_HEAD_STROKE = 0.17;
const STEM_OFFSET = 0.56;
const STEM_LENGTH = 3.4;
const THINNEST_STEM = 0.7;
const STEM_WIDTH = 0.13;
const FLAG_SPACING = 0.8;
const FLAG_WIDTH = 0.22;
const FLAG_CURVE: readonly (readonly [across: number, down: number])[] = [
  [0.15, 1.1],
  [1.3, 1.2],
  [0.9, 2.5],
];
const FERMATA_RADIUS = 1.1;
const FERMATA_ABOVE_STAFF = 1.4;
const FERMATA_ABOVE_STEM = 4.4;
const FERMATA_ABOVE_HEAD = 1.8;
const FERMATA_WIDTH = 0.3;
const FERMATA_DOT_LIFT = 0.3;
const FERMATA_DOT_RADIUS = 0.22;
const SLUR_LIFT_SHARE = 0.25;
const LOWEST_SLUR_LIFT = 1.5;
const HIGHEST_SLUR_LIFT = 5;
const SLUR_ABOVE_HEAD = 0.7;
const SLUR_WIDTH = 0.2;
const SLUR_DASH = 0.6;
const SLUR_GAP = 0.5;
const SLUR_OPACITY = 0.85;

export interface Note {
  readonly commit: PlacedCommit;
  readonly qubit: number;
  readonly system: number;
  readonly x: number;
  readonly steps: readonly number[];
  readonly ys: readonly number[];
  readonly value: number;
}

export interface NoteDrawing {
  readonly ledgers: SvgElement[];
  readonly glyphs: SvgElement[];
  readonly marks: SvgElement[];
}

function noteValue(waitSeconds: number | undefined): number {
  if (waitSeconds === undefined) return HALF;
  const hours = waitSeconds / SECONDS_PER_HOUR;
  return NOTE_VALUE_BY_LONGEST_WAIT_IN_HOURS.find(([longest]) => hours < longest)?.[1] ?? WHOLE;
}

export function noteFor(systems: Systems, commit: PlacedCommit, qubit: number, next: PlacedCommit | undefined): Note {
  const system = systemOf(systems, commit.timeFraction);
  const hour = new Date(commit.commit.committedAt * 1000).getUTCHours();
  const lowest = Math.round(LOWEST_PITCH_STEP + (hour * PITCH_STEPS_ACROSS_THE_DAY) / LAST_HOUR);
  const chordSize = Math.min(LARGEST_CHORD, 1 + Math.floor(Math.log2(commit.weight)));
  const steps = Array.from({ length: chordSize }, (_, index) => lowest + STEPS_BETWEEN_CHORD_NOTES * index);
  const wait = next && Math.max(0, next.commit.earliestCommittedAt - commit.commit.committedAt);
  return {
    commit,
    qubit,
    system,
    x: xAt(systems, commit.timeFraction, system),
    steps,
    ys: steps.map((step) => stepY(systems, system, qubit, step)),
    value: noteValue(wait),
  };
}

export const noteHead = (note: Note): Point => [note.x, note.ys[0]];

function ledgerLines(systems: Systems, note: Note): SvgElement[] {
  const steps: number[] = [];
  for (let step = BOTTOM_LEDGER_STEP; step >= Math.min(...note.steps); step -= STEPS_BETWEEN_CHORD_NOTES) steps.push(step);
  for (let step = TOP_LEDGER_STEP; step <= Math.max(...note.steps); step += STEPS_BETWEEN_CHORD_NOTES) steps.push(step);
  return steps.map((step) => {
    const y = stepY(systems, note.system, note.qubit, step);
    const reach = LEDGER_HALF_WIDTH * systems.space;
    return element("path", {
      d: polylinePath([
        [note.x - reach, y],
        [note.x + reach, y],
      ]),
      opacity: LEDGER_OPACITY,
    });
  });
}

function heads(systems: Systems, note: Note, theme: Theme): SvgElement[] {
  const { space } = systems;
  const open = note.value <= HALF;
  const colour = note.commit.colour;
  return note.ys.map((y) =>
    element("ellipse", {
      cx: note.x,
      cy: y,
      rx: HEAD_RADIUS_ACROSS * space,
      ry: HEAD_RADIUS_UP * space,
      transform: `rotate(${HEAD_TILT_DEGREES} ${formatNumber(note.x)} ${formatNumber(y)})`,
      fill: open ? theme.background : colour,
      stroke: colour,
      "stroke-width": open ? OPEN_HEAD_STROKE * space : 0,
    }),
  );
}

function stemAndFlags(systems: Systems, note: Note): SvgElement[] {
  if (note.value === WHOLE) return [];
  const { space } = systems;
  const colour = note.commit.colour;
  const up = ((note.steps[0] ?? 0) + (note.steps.at(-1) ?? 0)) / 2 < MIDDLE_LINE_STEP;
  const direction = up ? 1 : -1;
  const stemX = note.x + direction * STEM_OFFSET * space;
  const from = up ? Math.max(...note.ys) : Math.min(...note.ys);
  const to = up ? Math.min(...note.ys) - STEM_LENGTH * space : Math.max(...note.ys) + STEM_LENGTH * space;
  const stem = element("path", {
    d: polylinePath([
      [stemX, from],
      [stemX, to],
    ]),
    stroke: colour,
    "stroke-width": Math.max(STEM_WIDTH * space, THINNEST_STEM),
  });
  const flags = Array.from({ length: Math.max(0, note.value - QUARTER) }, (_, index) => {
    const y = to + direction * index * FLAG_SPACING * space;
    const at = (across: number, down: number) => `${formatNumber(stemX + across * space)},${formatNumber(y + direction * down * space)}`;
    return element("path", {
      d: `M${at(0, 0)} C${FLAG_CURVE.map(([across, down]) => at(across, down)).join(" ")}`,
      stroke: colour,
      "stroke-width": FLAG_WIDTH * space,
      fill: "none",
    });
  });
  return [stem, ...flags];
}

function fermata(systems: Systems, note: Note, theme: Theme): SvgElement[] {
  if (!note.commit.isHead) return [];
  const { space } = systems;
  const clearance = note.value > WHOLE ? FERMATA_ABOVE_STEM : FERMATA_ABOVE_HEAD;
  const y = Math.min(staffTop(systems, note.system, note.qubit) - FERMATA_ABOVE_STAFF * space, Math.min(...note.ys) - clearance * space);
  const radius = FERMATA_RADIUS * space;
  return [
    element("path", {
      d: `M${formatNumber(note.x - radius)},${formatNumber(y)} A${formatNumber(radius)},${formatNumber(radius)} 0 0 1 ${formatNumber(note.x + radius)},${formatNumber(y)}`,
      fill: "none",
      stroke: theme.ink,
      "stroke-width": FERMATA_WIDTH * space,
    }),
    element("circle", { cx: note.x, cy: y - FERMATA_DOT_LIFT * space, r: FERMATA_DOT_RADIUS * space }),
  ];
}

export const drawNote = (systems: Systems, note: Note, theme: Theme): NoteDrawing => ({
  ledgers: ledgerLines(systems, note),
  glyphs: [...heads(systems, note, theme), ...stemAndFlags(systems, note)],
  marks: fermata(systems, note, theme),
});

function slur(systems: Systems, [fromX, fromY]: Point, [toX, toY]: Point, colour: string, dashed: boolean): SvgElement {
  const { space } = systems;
  const lift = clamp(SLUR_LIFT_SHARE * Math.abs(toX - fromX), LOWEST_SLUR_LIFT * space, HIGHEST_SLUR_LIFT * space);
  const peak = Math.min(fromY, toY) - lift;
  const reach = (toX - fromX) * SLUR_LIFT_SHARE;
  return element("path", {
    d: `M${formatNumber(fromX)},${formatNumber(fromY - SLUR_ABOVE_HEAD * space)} C${formatNumber(fromX + reach)},${formatNumber(peak)} ${formatNumber(toX - reach)},${formatNumber(peak)} ${formatNumber(toX)},${formatNumber(toY - SLUR_ABOVE_HEAD * space)}`,
    stroke: colour,
    "stroke-width": SLUR_WIDTH * space,
    "stroke-dasharray": dashed ? `${formatNumber(SLUR_DASH * space)} ${formatNumber(SLUR_GAP * space)}` : null,
    opacity: SLUR_OPACITY,
  });
}

export function slurs(systems: Systems, gate: PlacedGate, noteOf: ReadonlyMap<PlacedCommit, Note>): SvgElement[] {
  const target = noteOf.get(gate.target);
  if (!target) return [];
  return gate.controls.flatMap((control) => {
    const from = noteOf.get(control);
    if (!from || from.system !== target.system) return [];
    const colour = gate.kind === "merge" ? control.colour : gate.target.colour;
    return [slur(systems, noteHead(from), noteHead(target), colour, gate.kind === "fork")];
  });
}
