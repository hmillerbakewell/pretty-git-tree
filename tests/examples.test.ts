import { expect, test } from "vitest";
import { sliceLog } from "../src/core/index.ts";
import index from "../src/web/examples/index.json" with { type: "json" };
import { exampleLog } from "./corpus.ts";

const utcMidnightAsTheWindowsAre = (day: string) => Date.parse(`${day}T00:00Z`) / 1000;

for (const example of index.examples) {
  test(`the ${example.name} example is cut to its window, with HEAD in it`, () => {
    const log = exampleLog(example.name);
    expect(log.commits.length).toBeGreaterThan(0);
    expect(log.head).not.toBeNull();
    for (const commit of log.commits) {
      expect(commit.committedAt).toBeGreaterThanOrEqual(utcMidnightAsTheWindowsAre(example.range.start));
      expect(commit.committedAt).toBeLessThan(utcMidnightAsTheWindowsAre(example.range.end));
    }
    expect(sliceLog(log).commits.length).toBe(log.commits.length);
  });
}
