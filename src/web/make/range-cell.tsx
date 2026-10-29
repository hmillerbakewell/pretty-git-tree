import { formatDayRange } from "../../core/index.ts";
import { Cell } from "../components/cell.tsx";
import { RadioGroup } from "../components/radio-group.tsx";
import { bounds, customRange, type DayRange, day, PRESET_LABELS, type Preset, presetRange } from "../range.ts";
import type { SavedInput } from "./saved-input.ts";

const PRESETS_AS_TABLE: Preset[] = ["today", "this-week", "this-month", "custom", "yesterday", "last-week", "last-month"];

export const selectedRange = (saved: SavedInput, now = new Date()): DayRange =>
  saved.preset === "custom" ? customRange(saved.customFrom, saved.customTo, now) : presetRange(saved.preset, now);

export function daysIn(range: DayRange): string {
  const { since, until } = bounds(range);
  return formatDayRange(since, until ?? Date.now() / 1000);
}

function CustomDays({ saved, update }: { saved: SavedInput; update: (changes: Partial<SavedInput>) => void }) {
  const today = day(new Date());
  return (
    <div class="fields">
      <label class="field">
        <span class="label">From</span>
        <input
          type="date"
          value={saved.customFrom}
          max={today}
          onInput={(event) => event.currentTarget.value && update({ customFrom: event.currentTarget.value })}
        />
      </label>
      <label class="field">
        <span class="label">To</span>
        <input
          type="date"
          value={saved.customTo}
          min={saved.customFrom}
          max={today}
          onInput={(event) => event.currentTarget.value && update({ customTo: event.currentTarget.value })}
        />
      </label>
    </div>
  );
}

export function RangeCell({ saved, update }: { saved: SavedInput; update: (changes: Partial<SavedInput>) => void }) {
  return (
    <Cell label="Range" meta={daysIn(selectedRange(saved))} title="Which days?">
      {(titleId) => (
        <>
          <RadioGroup
            className="ranges"
            labelledBy={titleId}
            selected={saved.preset}
            onSelect={(preset) => update({ preset })}
            options={PRESETS_AS_TABLE.map((preset) => ({
              value: preset,
              content: PRESET_LABELS[preset],
              className: preset === "custom" ? "custom" : undefined,
            }))}
          />
          {saved.preset === "custom" && <CustomDays saved={saved} update={update} />}
        </>
      )}
    </Cell>
  );
}
