import { readFileSync } from "node:fs";
import { type Log, parseLog, SAMPLES, sampleLog } from "../src/core/index.ts";
import index from "../src/web/examples/index.json" with { type: "json" };

export const exampleLog = (name: string): Log => parseLog(readFileSync(`src/web/examples/${name}.log`, "utf8"));

export const corpus: [string, Log][] = [
  ...SAMPLES.map(({ name }): [string, Log] => [name, sampleLog(name)]),
  ...index.examples.map(({ name }): [string, Log] => [name, exampleLog(name)]),
];
