import type { Renderer } from "../style/renderer.ts";
import { alluvial } from "./alluvial.ts";
import { arcs } from "./arcs.ts";
import { circuit } from "./circuit.ts";
import { commutative } from "./commutative.ts";
import { delta } from "./delta.ts";
import { faces } from "./faces.ts";
import { feynman } from "./feynman.ts";
import { kintsugi } from "./kintsugi.ts";
import { lattice } from "./lattice.ts";
import { qubits } from "./qubits.ts";
import { ridgeline } from "./ridgeline.ts";
import { rings } from "./rings.ts";
import { score } from "./score.ts";
import { seifert } from "./seifert.ts";
import { strings } from "./strings.ts";
import { towers } from "./towers.ts";
import { weave } from "./weave.ts";

const registry = new Map<string, Renderer>();

export function register(renderer: Renderer): Renderer {
  registry.set(renderer.name, renderer);
  return renderer;
}

export function getRenderer(name: string): Renderer {
  const renderer = registry.get(name);
  if (!renderer) throw new Error(`unknown style ${name}; available: ${[...registry.keys()].sort().join(", ")}`);
  return renderer;
}

export const renderers = (): Renderer[] => [...registry.values()].sort((a, b) => a.name.localeCompare(b.name));

const BUILT_IN_STYLES: readonly Renderer[] = [
  circuit,
  commutative,
  faces,
  lattice,
  qubits,
  arcs,
  ridgeline,
  kintsugi,
  score,
  seifert,
  towers,
  delta,
  strings,
  alluvial,
  weave,
  rings,
  feynman,
];

for (const renderer of BUILT_IN_STYLES) register(renderer);
