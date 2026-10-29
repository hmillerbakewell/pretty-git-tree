import { XMLValidator } from "fast-xml-parser";
import { describe, expect, test } from "vitest";
import {
  DEFAULT_OPTIONS,
  FORMATS,
  type Graph,
  type Layout,
  layout,
  renderers,
  renderGraph,
  SAMPLES,
  sampleLog,
  simplify,
  sliceLog,
  THEMES,
} from "../src/core/index.ts";

const DAY = 86400;
const FEATURE_LOG_COMMITS_ONE_A_DAY_FROM_2_JANUARY_2026 = 13;
const OPEN_BRANCHES_MAIN_SEARCH_AND_SPIKE = 3;
const featureLog = () => sampleLog("feature-branches");
const valid = (svg: string) => expect(XMLValidator.validate(svg)).toBe(true);
const merges = (graph: Graph) => graph.commits.filter((commit) => commit.parents.length > 1).length;
const trunkLane = (laidOut: Layout) => laidOut.lanes.find((lane) => lane.slot === 0);

test("reads the whole graph, parents before children", () => {
  const graph = sliceLog(featureLog());
  expect(graph.commits).toHaveLength(FEATURE_LOG_COMMITS_ONE_A_DAY_FROM_2_JANUARY_2026);
  expect(graph.outOfRangeParents).toEqual([]);
  expect(graph.continuingAfterRange).toEqual([]);
  expect(merges(graph)).toBe(1);
  const seen = new Set<string>();
  for (const commit of graph.commits) {
    for (const parent of commit.parents) expect(seen.has(parent)).toBe(true);
    seen.add(commit.sha);
  }
});

test("a time range creates boundary inputs and continuations", () => {
  const log = featureLog();
  const firstTimestamp = log.commits[0].committedAt;
  const graph = sliceLog(log, { since: firstTimestamp + 3 * DAY, until: firstTimestamp + 7 * DAY });
  expect(graph.commits.length).toBeGreaterThan(0);
  expect(graph.commits.length).toBeLessThan(FEATURE_LOG_COMMITS_ONE_A_DAY_FROM_2_JANUARY_2026);
  expect(graph.outOfRangeParents.length, "commits before the range become left-edge inputs").toBeGreaterThan(0);
  expect(graph.continuingAfterRange.length, "commits after the range mark wires as continuing").toBeGreaterThan(0);
});

test("fusion preserves topology", () => {
  const base = sliceLog(featureLog());
  const full = simplify(base, "full");
  const fused = simplify(base, "fused");
  expect(fused.commits.length).toBeLessThan(full.commits.length);
  expect(fused.commits.reduce((total, commit) => total + commit.fusedShas.length, 0)).toBe(full.commits.length);
  expect(merges(fused)).toBe(1);
  const kept = new Set(fused.commits.map((commit) => commit.sha));
  for (const commit of fused.commits) for (const parent of commit.parents) expect(kept.has(parent)).toBe(true);
  expect(base, "input is not mutated").toEqual(sliceLog(featureLog()));
});

test("in chronological time a fused node spans its run, as the full graph places it", () => {
  for (const { name } of SAMPLES) {
    const base = sliceLog(sampleLog(name));
    const options = { ...DEFAULT_OPTIONS, timeMode: "chronological" as const };
    const fullTimeOf = new Map(layout(simplify(base, "full"), options).placements.map((placement) => [placement.sha, placement.timeFraction]));
    const fused = simplify(base, "fused");
    const runOf = new Map(fused.commits.map((commit) => [commit.sha, commit.fusedShas]));
    for (const placement of layout(fused, options).placements) {
      const runTimes = (runOf.get(placement.sha) ?? []).map((sha) => fullTimeOf.get(sha) ?? Number.NaN);
      expect(placement.runStartTimeFraction, name).toBeCloseTo(Math.min(...runTimes));
      expect(placement.timeFraction, name).toBeCloseTo(Math.max(...runTimes));
    }
  }
});

function expectNoOverlapWithinASlot(laidOut: Layout): void {
  const timeOf = new Map(laidOut.placements.map((placement) => [placement.sha, placement.timeFraction]));
  const spansBySlot = new Map<number, [number, number][]>();
  for (const lane of laidOut.lanes) {
    const span: [number, number] = [timeOf.get(lane.shas[0]) ?? Number.NaN, timeOf.get(lane.shas[lane.shas.length - 1]) ?? Number.NaN];
    spansBySlot.set(lane.slot, [...(spansBySlot.get(lane.slot) ?? []), span]);
  }
  for (const spans of spansBySlot.values()) {
    spans.sort((a, b) => a[0] - b[0]);
    for (let index = 1; index < spans.length; index++) expect(spans[index - 1][1]).toBeLessThan(spans[index][0]);
  }
}

const LAYOUT_CHOICES = (["full", "fused"] as const).flatMap((level) =>
  (["topological", "chronological"] as const).flatMap((timeMode) => (["centre", "edge"] as const).map((arrange) => ({ level, timeMode, arrange }))),
);

describe("layout", () => {
  for (const { name } of SAMPLES) {
    test(`${name}: lanes sharing a slot never overlap`, () => {
      const base = sliceLog(sampleLog(name));
      for (const { level, timeMode, arrange } of LAYOUT_CHOICES) {
        const laidOut = layout(simplify(base, level), { timeMode, arrange, route: "straight", twistEvery: 0 });
        expectNoOverlapWithinASlot(laidOut);
        expect(new Set(laidOut.placements.map((placement) => placement.sha)).size).toBe(laidOut.placements.length);
        if (arrange === "edge") expect(laidOut.lanes.every((lane) => lane.slot >= 0)).toBe(true);
        expect(trunkLane(laidOut)?.shas).toContain(base.headSha);
      }
    });
  }

  test("the trunk is HEAD's line", () => {
    const graph = sliceLog(sampleLog("gitflow"));
    const trunk = trunkLane(layout(simplify(graph)));
    expect(trunk?.shas.at(-1)).toBe(graph.headSha);
    expect(trunk?.leavesThroughRightEdge).toBe(true);
  });

  test("twists are spaced by commits, in quiet stretches", () => {
    const graph = simplify(sliceLog(sampleLog("busy-team")));
    const total = graph.commits.reduce((sum, commit) => sum + (commit.fusedShas.length || 1), 0);
    for (const timeMode of ["topological", "chronological"] as const) {
      const few = layout(graph, { timeMode, arrange: "centre", route: "straight", twistEvery: Math.ceil(total / 2) });
      const many = layout(graph, { timeMode, arrange: "centre", route: "straight", twistEvery: Math.ceil(total / 5) });
      expect(few.halfTwistWindows.length).toBeGreaterThan(0);
      expect(many.halfTwistWindows.length).toBeGreaterThan(few.halfTwistWindows.length);
      for (const [start, end] of many.halfTwistWindows) expect(start).toBeLessThan(end);
    }
    expect(layout(graph, { timeMode: "topological", arrange: "centre", route: "straight", twistEvery: total + 1 }).halfTwistWindows).toHaveLength(0);
  });
});

test("renders the title and every open branch as an output", () => {
  const graph = sliceLog(featureLog(), { repoName: "demo" });
  const svg = renderGraph(graph);
  valid(svg);
  expect(svg).toContain(">demo<");
  expect(layout(simplify(graph)).lanes.filter((lane) => lane.leavesThroughRightEdge)).toHaveLength(OPEN_BRANCHES_MAIN_SEARCH_AND_SPIKE);
});

test("every format and theme renders", () => {
  const graph = sliceLog(featureLog());
  for (const format of Object.keys(FORMATS)) for (const theme of Object.keys(THEMES)) valid(renderGraph(graph, { format, theme }));
});

test("an empty range says so", () => {
  const svg = renderGraph(sliceLog(featureLog(), { since: Date.UTC(2030, 0, 1) / 1000 }));
  valid(svg);
  expect(svg).toContain("no commits in this range");
});

function middleThirdOf(name: string): Graph {
  const whole = sliceLog(sampleLog(name));
  if (whole.firstCommittedAt === null || whole.lastCommittedAt === null) throw new Error(`sample ${name} has no commits`);
  const [first, duration] = [whole.firstCommittedAt, whole.lastCommittedAt - whole.firstCommittedAt];
  return sliceLog(sampleLog(name), { since: first + duration / 3, until: first + (duration * 2) / 3 });
}

const RENDER_CHOICES = [
  ["centre", "straight", 0],
  ["edge", "straight", 4],
  ["centre", "fill", 4],
] as const;

test("every sample renders in every style", () => {
  for (const { name } of SAMPLES) {
    for (const graph of [sliceLog(sampleLog(name)), middleThirdOf(name)]) {
      for (const level of ["full", "fused"] as const) {
        for (const { name: style } of renderers()) {
          for (const [arrange, route, twistEvery] of RENDER_CHOICES) {
            const svg = renderGraph(graph, { level, style, arrange, route, twistEvery });
            valid(svg);
            expect(svg, `${name}/${style}`).not.toMatch(/NaN|undefined|Infinity/);
          }
        }
      }
    }
  }
});
