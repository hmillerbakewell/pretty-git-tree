import type { Frame } from "../../draw/frame.ts";
import { element, formatNumber, polylinePath, type SvgElement } from "../../draw/svg.ts";
import { SERIF } from "../../draw/themes.ts";
import type { PlacedWire } from "../qubits.ts";

const STAFF_LINE_COUNT = 5;
export const STAFF_HEIGHT = STAFF_LINE_COUNT - 1;
const GAP_BETWEEN_STAVES = 4.5;
const GAP_BETWEEN_SYSTEMS = 6;
const ROOM_ABOVE_AND_BELOW_SYSTEMS = 6;
const ROOM_BEFORE_FIRST_NOTE = 5;
const ROOM_AFTER_LAST_NOTE = 1;
const STAFF_START = 1.5;
const CLOSEST_COLUMNS = 2.6;
const MOST_SYSTEMS = 6;
const LARGEST_STAFF_SPACE = 14;
const GAIN_WORTH_ANOTHER_SYSTEM = 1.05;
const COLUMNS_PER_BAR = 4;
const FAINT_STAFF_OPACITY = 0.45;
const BRACKET_OFFSET = 0.8;
const BRACKET_OVERHANG = 1;
const BRACKET_WIDTH = 0.5;
const BRACKET_CURL_WIDTH = 0.22;
const CURL_TAIL = 0.25;
const CURL_CONTROL = 0.6;
const CURL_REACH = 1.4;
const CURL_RISE = 0.8;
const DOUBLE_BAR_THIN_INSET = 0.9;
const DOUBLE_BAR_THICK_INSET = 0.25;
const TIME_SIGNATURE_X = 1.9;
const TIME_SIGNATURE_STEPS = [2, 6];
const TIME_SIGNATURE_BASELINE_DROP = 0.95;
const TIME_SIGNATURE_SIZE = 2.7;

export interface Systems {
  readonly count: number;
  readonly space: number;
  readonly qubitCount: number;
  readonly top: number;
  readonly height: number;
  readonly staffLeft: number;
  readonly staffRight: number;
  readonly firstNoteX: number;
  readonly lastNoteX: number;
  readonly thinLine: number;
}

function bestSystemCount(frame: Frame, staffHeights: number, columnCount: number): { count: number; space: number } {
  const [left, top, right, bottom] = frame.plot;
  let best = { count: 1, space: 0 };
  for (let count = 1; count <= MOST_SYSTEMS; count++) {
    const byHeight = (bottom - top) / (count * staffHeights + (count - 1) * GAP_BETWEEN_SYSTEMS + ROOM_ABOVE_AND_BELOW_SYSTEMS);
    const byWidth = ((right - left) * count) / Math.max(columnCount, 1) / CLOSEST_COLUMNS;
    const space = Math.min(byHeight, byWidth, LARGEST_STAFF_SPACE * frame.unit);
    if (space > best.space * GAIN_WORTH_ANOTHER_SYSTEM) best = { count, space };
  }
  return best;
}

export function fitSystems(frame: Frame, qubitCount: number, columnCount: number): Systems {
  const [left, top, right, bottom] = frame.plot;
  const staffHeights = STAFF_HEIGHT * qubitCount + GAP_BETWEEN_STAVES * (qubitCount - 1);
  const { count, space } = bestSystemCount(frame, staffHeights, columnCount);
  const height = staffHeights * space;
  return {
    count,
    space,
    qubitCount,
    top: top + (bottom - top - (count * height + (count - 1) * GAP_BETWEEN_SYSTEMS * space)) / 2,
    height,
    staffLeft: left + STAFF_START * space,
    staffRight: right,
    firstNoteX: left + ROOM_BEFORE_FIRST_NOTE * space,
    lastNoteX: right - ROOM_AFTER_LAST_NOTE * space,
    thinLine: Math.max(frame.unit, 0.8),
  };
}

export const systemOf = (systems: Systems, time: number): number => Math.min(systems.count - 1, Math.floor(time * systems.count));

export const xAt = (systems: Systems, time: number, system = systemOf(systems, time)): number =>
  systems.firstNoteX + (time * systems.count - system) * (systems.lastNoteX - systems.firstNoteX);

export const staffTop = (systems: Systems, system: number, qubit: number): number =>
  systems.top + system * (systems.height + GAP_BETWEEN_SYSTEMS * systems.space) + qubit * (STAFF_HEIGHT + GAP_BETWEEN_STAVES) * systems.space;

export const stepY = (systems: Systems, system: number, qubit: number, step: number): number =>
  staffTop(systems, system, qubit) + STAFF_HEIGHT * systems.space - (step * systems.space) / 2;

const systemIndices = (systems: Systems) => Array.from({ length: systems.count }, (_, system) => system);

const verticalLine = (x: number, top: number, bottom: number, strokeWidth: number): SvgElement =>
  element("path", {
    d: polylinePath([
      [x, top],
      [x, bottom],
    ]),
    "stroke-width": strokeWidth,
  });

function staffPath(systems: Systems, fromX: number, toX: number, top: number): string {
  return Array.from({ length: STAFF_LINE_COUNT }, (_, line) =>
    polylinePath([
      [fromX, top + line * systems.space],
      [toX, top + line * systems.space],
    ]),
  ).join(" ");
}

export const faintStaves = (systems: Systems): SvgElement[] =>
  systemIndices(systems).flatMap((system) =>
    Array.from({ length: systems.qubitCount }, (_, qubit) =>
      element("path", { d: staffPath(systems, systems.staffLeft, systems.staffRight, staffTop(systems, system, qubit)), opacity: FAINT_STAFF_OPACITY }),
    ),
  );

export function voiceStaves(systems: Systems, wire: PlacedWire): SvgElement[] {
  const [start, end] = [Math.max(wire.start, 0), Math.min(wire.end, 1)];
  const [firstSystem, lastSystem] = [systemOf(systems, start), systemOf(systems, end)];
  return systemIndices(systems)
    .filter((system) => system >= firstSystem && system <= lastSystem)
    .flatMap((system) => {
      const fromX = system === firstSystem ? xAt(systems, start, system) : systems.staffLeft;
      const toX = system === lastSystem ? xAt(systems, end, system) : systems.staffRight;
      return toX > fromX ? [element("path", { d: staffPath(systems, fromX, toX, staffTop(systems, system, wire.qubit)) })] : [];
    });
}

function bracket(systems: Systems, top: number, bottom: number): SvgElement[] {
  const { space } = systems;
  const x = systems.staffLeft - BRACKET_OFFSET * space;
  const curl = (y: number, outward: number) =>
    `M${formatNumber(x - CURL_TAIL * space)},${formatNumber(y)} Q${formatNumber(x + CURL_CONTROL * space)},${formatNumber(y)} ${formatNumber(x + CURL_REACH * space)},${formatNumber(y + outward * CURL_RISE * space)}`;
  const [above, below] = [top - BRACKET_OVERHANG * space, bottom + BRACKET_OVERHANG * space];
  return [
    verticalLine(x, above, below, BRACKET_WIDTH * space),
    element("path", { d: `${curl(above, -1)} ${curl(below, 1)}`, "stroke-width": BRACKET_CURL_WIDTH * space }),
  ];
}

function barLinesBetweenColumns(systems: Systems, system: number, columns: readonly number[], top: number, bottom: number): SvgElement[] {
  const here = columns.filter((column) => systemOf(systems, column) === system);
  const barCount = Math.max(0, Math.ceil((here.length - COLUMNS_PER_BAR) / COLUMNS_PER_BAR));
  return Array.from({ length: barCount }, (_, bar) => {
    const after = (bar + 1) * COLUMNS_PER_BAR;
    const x = (xAt(systems, here[after - 1], system) + xAt(systems, here[after], system)) / 2;
    return verticalLine(x, top, bottom, systems.thinLine);
  });
}

function endBar(systems: Systems, system: number, top: number, bottom: number): SvgElement[] {
  const { staffRight, space, thinLine } = systems;
  if (system < systems.count - 1) return [verticalLine(staffRight, top, bottom, thinLine)];
  return [
    verticalLine(staffRight - DOUBLE_BAR_THIN_INSET * space, top, bottom, thinLine),
    verticalLine(staffRight - DOUBLE_BAR_THICK_INSET * space, top, bottom, BRACKET_WIDTH * space),
  ];
}

export const systemBars = (systems: Systems, columns: readonly number[]): SvgElement[] =>
  systemIndices(systems).flatMap((system) => {
    const [top, bottom] = [staffTop(systems, system, 0), staffTop(systems, system, systems.qubitCount - 1) + STAFF_HEIGHT * systems.space];
    return [
      verticalLine(systems.staffLeft, top, bottom, systems.thinLine),
      ...(systems.qubitCount > 1 ? bracket(systems, top, bottom) : []),
      ...barLinesBetweenColumns(systems, system, columns, top, bottom),
      ...endBar(systems, system, top, bottom),
    ];
  });

export const timeSignature = (systems: Systems): SvgElement[] =>
  Array.from({ length: systems.qubitCount }, (_, qubit) =>
    TIME_SIGNATURE_STEPS.map((step) =>
      element(
        "text",
        {
          x: systems.staffLeft + TIME_SIGNATURE_X * systems.space,
          y: stepY(systems, 0, qubit, step) + TIME_SIGNATURE_BASELINE_DROP * systems.space,
          "font-family": SERIF,
          "font-weight": "bold",
          "font-size": TIME_SIGNATURE_SIZE * systems.space,
          "text-anchor": "middle",
        },
        [String(COLUMNS_PER_BAR)],
      ),
    ),
  ).flat();
