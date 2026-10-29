import type { Frame } from "../draw/frame.ts";
import { element, type SvgElement } from "../draw/svg.ts";
import type { Theme } from "../draw/themes.ts";
import { weight } from "../graph/queries.ts";
import { formatDayRange } from "../history/dates.ts";
import type { Graph } from "../model.ts";
import { plural } from "../util/text.ts";

const HEADING_SHARE_OF_SHORT_SIDE = 0.062;
const FOOTNOTE_SHARE_OF_SHORT_SIDE = 0.022;

function daysCovered(graph: Graph): string | null {
  const start = graph.since ?? graph.firstCommittedAt;
  const end = graph.until ?? graph.lastCommittedAt ?? start;
  return start !== null && end !== null ? formatDayRange(start, end) : null;
}

function statsLine(graph: Graph, branchCount: number): string {
  const commitCount = graph.commits.reduce((total, commit) => total + weight(commit), 0);
  const mergeCount = graph.commits.filter((commit) => commit.parents.length > 1).length;
  return [plural(commitCount, "commit"), plural(branchCount, "branch"), plural(mergeCount, "merge")].join("  ·  ");
}

export function titleLayers(graph: Graph, theme: Theme, frame: Frame, branchCount: number, headingFont = theme.fontSans): SvgElement[] {
  const shortSide = Math.min(frame.width, frame.height);
  const headingSize = Math.round(shortSide * HEADING_SHARE_OF_SHORT_SIDE);
  const headingBaseline = frame.margin + headingSize * 0.8;
  const footnoteBaseline = frame.height - frame.margin * 0.6;
  const days = daysCovered(graph);
  const footnote = { "font-family": theme.fontMono, "font-size": Math.round(shortSide * FOOTNOTE_SHARE_OF_SHORT_SIDE), fill: theme.muted };

  const heading = element(
    "text",
    {
      x: frame.margin,
      y: headingBaseline,
      "font-family": headingFont,
      "font-size": headingSize,
      "font-weight": "bold",
      fill: theme.ink,
      "letter-spacing": -0.5,
    },
    [graph.repoName || days || "repository"],
  );
  const daysUnderRepoName =
    graph.repoName && days
      ? [
          element(
            "text",
            { x: frame.margin, y: headingBaseline + headingSize * 0.75, "font-family": theme.fontMono, "font-size": headingSize * 0.36, fill: theme.muted },
            [days],
          ),
        ]
      : [];
  const stats = element("text", { x: frame.margin, y: footnoteBaseline, ...footnote }, [statsLine(graph, branchCount)]);
  const wordmark = element("text", { x: frame.width - frame.margin, y: footnoteBaseline, "text-anchor": "end", ...footnote, opacity: 0.6 }, [
    "pretty-git-tree",
  ]);
  const emptyNotice = graph.commits.length
    ? []
    : [
        element("text", { x: frame.width / 2, y: frame.height / 2, "text-anchor": "middle", ...footnote, "font-size": footnote["font-size"] * 1.4 }, [
          "no commits in this range",
        ]),
      ];
  return [heading, ...daysUnderRepoName, stats, wordmark, ...emptyNotice];
}
