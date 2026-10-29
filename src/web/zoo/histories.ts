import { type Log, parseLog, SAMPLES, sampleLog } from "../../core/index.ts";
import index from "../examples/index.json" with { type: "json" };

export type HistoryKind = "example" | "sample";

export interface History {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: HistoryKind;
  readonly log: Log;
}

export const sampleHistories = (): History[] =>
  SAMPLES.map((sample) => ({
    id: sample.name,
    name: sample.name,
    description: sample.description,
    kind: "sample",
    log: sampleLog(sample.name),
  }));

export const exampleHistories = (): Promise<History[]> =>
  Promise.all(
    index.examples.map(async (example) => {
      const response = await fetch(new URL(`../examples/${example.name}.log`, import.meta.url));
      const log = parseLog(await response.text());
      return { id: `example:${example.name}`, name: example.name, description: example.description, kind: "example", log };
    }),
  );
