/**
 * Deterministic PRNG — mulberry32, the spec's choice for the mission engine.
 * Pure math, no globals: same seed, same stream, on every machine.
 */

/**
 * Returns a zero-argument generator producing stable floats in [0, 1) from a
 * 32-bit integer seed. Non-integer or negative seeds are normalized via
 * `>>> 0` so every number seeds the same stream.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit string hash — stable key for clue/constraint selection. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Force unsigned so downstream modulo behaves like a plain 32-bit value.
  return hash >>> 0;
}
