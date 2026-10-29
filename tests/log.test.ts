import { expect, test } from "vitest";
import { formatLog, type LogCommit, logArgs, logCommand, orderCommits, parseDate, parseLog, sliceLog } from "../src/core/index.ts";

const sha = (number: number) => number.toString(16).padStart(40, "0");

test("parses commits and the HEAD marker, skipping anything else", () => {
  const text = ["$ git log …", `${sha(3)} 300 ${sha(1)} ${sha(2)} (HEAD)`, `${sha(2)} 200 ${sha(1)}`, `${sha(1)} 100`, ""].join("\r\n");
  const log = parseLog(text);
  expect(log.head).toBe(sha(3));
  expect(log.commits.map((commit) => commit.sha)).toEqual([sha(1), sha(2), sha(3)]);
  expect(log.commits[2]).toEqual({ sha: sha(3), parents: [sha(1), sha(2)], committedAt: 300 });
});

test("names in other formats are dropped, not kept", () => {
  const old = `${sha(2)} 200 ${sha(1)} :: HEAD -> main, origin/secret-project :: Ada Lovelace :: fix the thing\n${sha(1)} 100 ::`;
  const log = parseLog(old);
  expect(log.commits).toHaveLength(2);
  const cleaned = formatLog(log);
  for (const word of ["main", "secret", "Ada", "fix"]) expect(cleaned).not.toContain(word);
  expect(parseLog(cleaned).commits).toEqual(log.commits);
});

test("formatting round-trips", () => {
  const text = `${sha(3)} 300 ${sha(2)} (HEAD)\n${sha(2)} 200 ${sha(1)}\n${sha(1)} 100`;
  expect(formatLog(parseLog(text))).toBe(text);
});

test("ordering keeps a branch's commits together", () => {
  const commit = (number: number, timestamp: number, ...parents: number[]): LogCommit => ({
    sha: sha(number),
    parents: parents.map(sha),
    committedAt: timestamp,
  });
  const mainMergingTheBranch = [commit(6, 60, 4, 5), commit(4, 40, 2), commit(2, 20, 1), commit(1, 10)];
  const branchOffTheRoot = [commit(5, 50, 3), commit(3, 30, 1)];
  const interleavedByDate = [...mainMergingTheBranch, ...branchOffTheRoot].sort((a, b) => b.committedAt - a.committedAt);
  const order = orderCommits(interleavedByDate).map((ordered) => parseInt(ordered.sha, 16));
  expect(order[0]).toBe(1);
  expect(order.at(-1)).toBe(6);
  expect(Math.abs(order.indexOf(3) - order.indexOf(5))).toBe(1);
  expect(Math.abs(order.indexOf(2) - order.indexOf(4))).toBe(1);
});

test("a range that ends before HEAD still finds the trunk", () => {
  const headOnMain = `${sha(5)} 50 ${sha(4)}`;
  const sideOffTwo = `${sha(3)} 30 ${sha(2)}`;
  const text = [`${headOnMain} (HEAD)`, `${sha(4)} 40 ${sha(2)}`, sideOffTwo, `${sha(2)} 20 ${sha(1)}`, `${sha(1)} 10`].join("\n");
  const justAfterTheSideCommit = 35;
  const graph = sliceLog(parseLog(text), { until: justAfterTheSideCommit });
  expect(graph.headSha).toBeNull();
  expect(graph.trunkTipSha).toBe(sha(2));
  expect(graph.continuingAfterRange).toEqual([sha(2)]);
});

test("refs are excluded by git, before --all", () => {
  expect(logArgs({ excludeGlobs: ["origin/dependabot/*"] }).slice(0, 3)).toEqual(["log", "--exclude=refs/*/origin/dependabot/*", "--all"]);
  expect(logCommand()).toBe("git log --all --no-color --decorate-refs=HEAD '--format=%H %ct %P%d'");
});

test("dates without a zone are local midnight", () => {
  expect(parseDate("2026-03-01")).toBe(new Date(2026, 2, 1).getTime() / 1000);
  expect(parseDate("2026-03-01T00:00:00Z")).toBe(Date.UTC(2026, 2, 1) / 1000);
  expect(parseDate(undefined)).toBeNull();
  expect(() => parseDate("last tuesday")).toThrow();
});
