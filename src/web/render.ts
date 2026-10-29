import { useMemo } from "preact/hooks";
import { type Graph, type Log, layout, renderGraph, type Selection, simplify, sliceLog } from "../core/index.ts";
import { reportError } from "./analytics.ts";
import { DIMENSIONS, type Settings } from "./settings.ts";

export const renderSvg = (graph: Graph, settings: Settings): string =>
  renderGraph(graph, {
    style: settings.style,
    theme: settings.theme,
    format: settings.format,
    level: settings.level,
    timeMode: settings.time,
    arrange: settings.arrange,
    route: settings.route,
    twistEvery: settings.twists === "off" ? 0 : Number(settings.twists),
  });

export interface Stats {
  readonly commits: number;
  readonly nodes: number;
  readonly branches: number;
  readonly merges: number;
  readonly first: number | null;
  readonly last: number | null;
}

export interface Prepared {
  readonly graph: Graph;
  readonly stats: Stats;
  readonly error?: string;
}

function statsOf(graph: Graph): Stats {
  const fused = simplify(graph);
  return {
    commits: graph.commits.length,
    nodes: fused.commits.length,
    branches: graph.commits.length ? layout(fused).lanes.length : 0,
    merges: graph.commits.filter((commit) => commit.parents.length > 1).length,
    first: graph.firstCommittedAt,
    last: graph.lastCommittedAt,
  };
}

export function prepare(log: Log, selection: Selection): Prepared {
  try {
    const graph = sliceLog(log, selection);
    return { graph, stats: statsOf(graph) };
  } catch (error) {
    reportError(error, { where: "prepare" });
    const empty = sliceLog({ commits: [], head: null }, { repoName: selection.repoName });
    return { graph: empty, stats: statsOf(empty), error: String(error) };
  }
}

export function useRender(prepared: Prepared, settings: Settings): { svg: string; error?: string } {
  return useMemo(() => {
    if (prepared.error) return { svg: "", error: prepared.error };
    try {
      return { svg: renderSvg(prepared.graph, settings) };
    } catch (error) {
      console.error(error);
      reportError(error, { where: "render", style: settings.style, format: settings.format });
      return { svg: "", error: String(error) };
    }
  }, [prepared, ...DIMENSIONS.map((dim) => settings[dim])]);
}
