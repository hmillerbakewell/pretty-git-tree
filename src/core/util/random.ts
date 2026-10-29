const MULBERRY32_INCREMENT = 0x6d2b79f5;
const TWO_TO_THE_32 = 4294967296;
const FNV1A_OFFSET_BASIS = 0x811c9dc5;
const FNV1A_PRIME = 0x01000193;

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return function mulberry32() {
    state = (state + MULBERRY32_INCREMENT) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / TWO_TO_THE_32;
  };
}

export function seedFromText(text: string): number {
  let fnv1a = FNV1A_OFFSET_BASIS;
  for (let index = 0; index < text.length; index++) fnv1a = Math.imul(fnv1a ^ text.charCodeAt(index), FNV1A_PRIME);
  return fnv1a >>> 0;
}
