import { describe, expect, test } from "vitest";
import { hilbertRoute, Route } from "../src/core/draw/embed.ts";

const CELL = 10;
const HALF_A_CELL = CELL / 2;
const SAMPLE_STEP = 2;
const FAR_ALONG_THE_ROUTE = 25;

describe("hilbertRoute", () => {
  for (const [cols, rows] of [
    [2, 2],
    [4, 4],
    [3, 5],
    [7, 2],
    [6, 9],
  ]) {
    test(`${cols}×${rows} passes through every cell`, () => {
      const route = hilbertRoute([0, 0, cols * CELL, rows * CELL], cols, rows);
      const seen = new Set<string>();
      for (let distance = 0; distance <= route.length; distance += 1) {
        const { x, y } = route.at(distance);
        seen.add(`${Math.min(Math.floor(x / CELL), cols - 1)},${Math.min(Math.floor(y / CELL), rows - 1)}`);
      }
      expect(seen.size).toBe(cols * rows);
    });
  }

  test("neighbouring passes keep a band of one cell width apart", () => {
    const route = hilbertRoute([0, 0, 80, 80], 8, 8);
    const samples = Array.from({ length: Math.ceil(route.length / SAMPLE_STEP) }, (_, index) => ({
      distance: index * SAMPLE_STEP,
      ...route.at(index * SAMPLE_STEP),
    }));
    for (const a of samples) {
      for (const b of samples) {
        if (Math.abs(a.distance - b.distance) > FAR_ALONG_THE_ROUTE) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(HALF_A_CELL);
      }
    }
  });
});

describe("Route", () => {
  const line = new Route([
    [0, 0],
    [10, 0],
  ]);

  test("offsets go to the left of the direction of travel", () => {
    expect(line.length).toBe(10);
    expect(line.point(5, 2)).toEqual([5, 2]);
    expect(line.angle(5)).toBe(0);
  });

  test("clamps to the ends", () => {
    expect(line.point(-3, 0)).toEqual([0, 0]);
    expect(line.point(99, 0)).toEqual([10, 0]);
  });
});
