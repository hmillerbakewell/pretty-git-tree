import { useState } from "preact/hooks";
import { day, PRESETS, type Preset, presetRange } from "../range.ts";
import { LAYOUT_DEFAULTS, onLayout, type Settings, validSettings } from "../settings.ts";
import { cleanLog } from "./paste.ts";

export interface SavedInput {
  readonly preset: Preset;
  readonly customFrom: string;
  readonly customTo: string;
  readonly excludedRefs: string;
  readonly settings: Settings;
  readonly log: string;
}

const STORAGE_KEY = "pgt:make";

const freshInput = (): SavedInput => ({
  preset: "this-week",
  customFrom: presetRange("this-week", new Date()).start,
  customTo: day(new Date()),
  excludedRefs: "",
  settings: LAYOUT_DEFAULTS,
  log: "",
});

const textOr = (value: unknown, fallback: string): string => (typeof value === "string" ? value : fallback);

function readStored(): Record<string, unknown> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return typeof stored === "object" && stored !== null ? { ...stored } : {};
  } catch {
    return {};
  }
}

function loadSavedInput(): SavedInput {
  const fresh = freshInput();
  const stored = readStored();
  const storedSettings = typeof stored.settings === "object" && stored.settings !== null ? stored.settings : {};
  return {
    preset: PRESETS.find((preset) => preset === stored.preset) ?? fresh.preset,
    customFrom: textOr(stored.customFrom, fresh.customFrom),
    customTo: textOr(stored.customTo, fresh.customTo),
    excludedRefs: textOr(stored.excludedRefs, ""),
    settings: onLayout(validSettings({ ...LAYOUT_DEFAULTS, ...storedSettings })),
    log: cleanLog(textOr(stored.log, "")),
  };
}

function storeSavedInput(input: SavedInput): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(input));
    return true;
  } catch {
    return false;
  }
}

export const hasSavedPaste = (): boolean => Boolean(readStored().log);

export function useSavedInput() {
  const [saved, setSaved] = useState(loadSavedInput);
  const [persisted, setPersisted] = useState(true);
  const update = (changes: Partial<SavedInput>) =>
    setSaved((current) => {
      const next = { ...current, ...changes };
      setPersisted(storeSavedInput(next));
      return next;
    });
  return { saved, update, persisted };
}
