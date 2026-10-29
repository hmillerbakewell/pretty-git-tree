import { useState } from "preact/hooks";
import { parseLog } from "../../core/index.ts";
import { shape, track } from "../analytics.ts";
import { prepare } from "../render.ts";
import { cleanLog, type PasteSource, readTextFile, usePasteAnywhere } from "./paste.ts";
import type { SavedInput } from "./saved-input.ts";

export function useLogInput(saved: SavedInput, update: (changes: Partial<SavedInput>) => void) {
  const [text, setText] = useState(saved.log);
  const [editing, setEditing] = useState(false);

  const takeText = (raw: string, source?: PasteSource) => {
    setText(raw);
    const parsed = parseLog(raw);
    const found = parsed.commits.length > 0;
    if (found && source) setEditing(false);
    if (!found && source && raw.trim()) track("paste_rejected", { via: source, range: saved.preset });
    const clean = cleanLog(raw);
    if (!found || clean === saved.log) return;
    update({ log: clean });
    track("log_pasted", { via: source ?? "typed", range: saved.preset, ...shape(prepare(parsed, {}).stats) });
  };

  usePasteAnywhere((raw) => takeText(raw, "paste"));

  const readFile = async (file: File | undefined, source: PasteSource) => {
    if (file) takeText(await readTextFile(file), source);
  };

  const clear = () => {
    setText("");
    update({ log: "" });
  };

  return { text, takeText, readFile, clear, editing, setEditing };
}

export type LogInput = ReturnType<typeof useLogInput>;
