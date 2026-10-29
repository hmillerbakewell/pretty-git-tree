import { useState } from "preact/hooks";
import { Cell } from "../components/cell.tsx";
import { localisedCount } from "../components/picture.tsx";
import { hasCommits, pasteSourceOf } from "./paste.ts";
import type { Drawing } from "./use-drawing.ts";
import type { LogInput } from "./use-log-input.ts";

const NO_HEAD_NOTE = ", but no HEAD marker, so the newest line is the trunk";

function PasteBox({ input, titleId }: { input: LogInput; titleId: string }) {
  const [dragging, setDragging] = useState(false);
  return (
    <textarea
      class={dragging ? "dragging" : ""}
      value={input.text}
      spellcheck={false}
      aria-labelledby={titleId}
      placeholder={"Paste here or anywhere on the page,\nor drop the file."}
      onInput={(event) => input.takeText(event.currentTarget.value, pasteSourceOf(event instanceof InputEvent ? event.inputType : undefined))}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        input.readFile(event.dataTransfer?.files[0], "drop");
      }}
    />
  );
}

function EmptyPasteStatus({ input }: { input: LogInput }) {
  return (
    <p class="paste-status">
      Or{" "}
      <label class="file-link">
        choose a file
        <input class="visually-hidden" type="file" accept=".txt,.log,text/plain" onChange={(event) => input.readFile(event.currentTarget.files?.[0], "file")} />
      </label>
      . It stays in this browser; nothing is uploaded.
    </p>
  );
}

function ReadPasteStatus({ input, drawing }: { input: LogInput; drawing: Drawing }) {
  return (
    <p class="paste-status" role="status">
      <strong>{localisedCount(drawing.log.commits.length, "commit")}</strong> read{drawing.log.head ? "" : NO_HEAD_NOTE}.{" "}
      <button type="button" class="inline" onClick={input.clear}>
        Clear
      </button>{" "}
      <button type="button" class="inline" onClick={() => input.setEditing(false)}>
        Done
      </button>
    </p>
  );
}

function PasteStatus({ input, drawing }: { input: LogInput; drawing: Drawing }) {
  if (input.text.trim() === "") return <EmptyPasteStatus input={input} />;
  if (!hasCommits(input.text)) {
    return (
      <p class="warn" role="status">
        No commits found. Is this the output of the command above?
      </p>
    );
  }
  return <ReadPasteStatus input={input} drawing={drawing} />;
}

export function PasteCell({ input, drawing }: { input: LogInput; drawing: Drawing }) {
  return (
    <Cell
      label="Input"
      className="paste"
      meta={drawing.pasted ? localisedCount(drawing.log.commits.length, "commit") : undefined}
      title="Paste what it printed"
    >
      {(titleId) => (
        <>
          <PasteBox input={input} titleId={titleId} />
          <PasteStatus input={input} drawing={drawing} />
        </>
      )}
    </Cell>
  );
}

export function InputSummary({ input, drawing }: { input: LogInput; drawing: Drawing }) {
  return (
    <Cell label="Input" className="summary" meta={localisedCount(drawing.log.commits.length, "commit")} title={drawing.days}>
      {() => (
        <>
          <p class="hint">
            Drawn from your paste{drawing.log.head ? "" : ", which has no HEAD marker, so the newest line is the trunk"}. Paste anywhere on the page to replace
            it.
          </p>
          <button type="button" class="button" onClick={() => input.setEditing(true)}>
            Change range or input
          </button>
        </>
      )}
    </Cell>
  );
}
