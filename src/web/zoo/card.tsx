import type { ComponentChildren } from "preact";
import { FORMATS } from "../../core/index.ts";
import { localisedCount, Picture } from "../components/picture.tsx";
import type { Prepared } from "../render.ts";
import type { Settings } from "../settings.ts";
import type { History } from "./histories.ts";

const monthOf = (seconds: number | null) => (seconds ? new Date(seconds * 1000).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "–");

function StatsLine({ stats }: { stats: Prepared["stats"] }) {
  return (
    <p class="stats">
      {localisedCount(stats.commits, "commit")} · {localisedCount(stats.branches, "branch")} · {localisedCount(stats.merges, "merge")}
      <br />
      {monthOf(stats.first)} → {monthOf(stats.last)} · {localisedCount(stats.nodes, "node")} after fusion
    </p>
  );
}

export function HistoryCaption({ history, prepared }: { history: History; prepared: Prepared }) {
  return (
    <>
      <div class="card-title">
        <strong>{history.name}</strong>
        <span class={`kind ${history.kind}`}>{history.kind}</span>
      </div>
      <p class="desc">{history.description}</p>
      <StatsLine stats={prepared.stats} />
    </>
  );
}

interface CardProps {
  readonly history: History;
  readonly prepared: Prepared;
  readonly settings: Settings;
  readonly onOpen: () => void;
  readonly caption: ComponentChildren;
}

export function Card({ history, prepared, settings, onOpen, caption }: CardProps) {
  const canvas = FORMATS[settings.format];
  return (
    <figure class="card">
      <button
        type="button"
        class="thumb"
        style={{ aspectRatio: canvas && `${canvas.width} / ${canvas.height}` }}
        onClick={onOpen}
        aria-label={`Open ${history.name}`}
      >
        <Picture prepared={prepared} settings={settings} alt={`${history.name} drawn as ${settings.style}`} />
      </button>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
