import { useState } from "preact/hooks";
import { logCommand } from "../../core/index.ts";
import { track } from "../analytics.ts";
import { Cell } from "../components/cell.tsx";
import { sinceArg, untilArg } from "../range.ts";
import { daysIn, selectedRange } from "./range-cell.tsx";
import type { SavedInput } from "./saved-input.ts";

const COPIED_NOTICE_MILLISECONDS = 1200;

function commandFor(saved: SavedInput): string {
  const range = selectedRange(saved);
  const exclude = saved.excludedRefs.split(/[\s,]+/).filter(Boolean);
  return logCommand({ excludeGlobs: exclude, since: sinceArg(range), until: untilArg(range) });
}

function CopyableCommand({ saved }: { saved: SavedInput }) {
  const [copied, setCopied] = useState(false);
  const command = commandFor(saved);
  const copy = () =>
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_NOTICE_MILLISECONDS);
      track("command_copied", { range: saved.preset, exclude: saved.excludedRefs.trim() !== "" });
    });
  return (
    <div class="command">
      <code>{command}</code>
      <button type="button" class={copied ? "done" : ""} onClick={copy} aria-live="polite">
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function ExcludedRefs({ saved, update }: { saved: SavedInput; update: (changes: Partial<SavedInput>) => void }) {
  return (
    <details class="more">
      <summary>Leave out branches</summary>
      <div class="more-body">
        <label class="field">
          <span class="label">Refs to leave out</span>
          <input
            value={saved.excludedRefs}
            placeholder="origin/dependabot/*"
            spellcheck={false}
            onInput={(event) => update({ excludedRefs: event.currentTarget.value })}
          />
          <span class="hint">Git skips them, so their names never leave your machine.</span>
        </label>
      </div>
    </details>
  );
}

export function CommandCell({ saved, update }: { saved: SavedInput; update: (changes: Partial<SavedInput>) => void }) {
  return (
    <Cell label="Command" title="Run this in your repository">
      {() => (
        <>
          <CopyableCommand saved={saved} />
          <p class="hint">
            It prints one line per commit in {daysIn(selectedRange(saved))}: its id, time and parents. No branch names, authors or messages. Copy what it prints
            and paste it below, or add <code>&gt; history.txt</code> to save it to a file and drop that in.
          </p>
          <ExcludedRefs saved={saved} update={update} />
        </>
      )}
    </Cell>
  );
}
