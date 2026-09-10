/**
 * Deterministic, non-cryptographic hash shared by everything in the engine
 * that needs reproducibility from a seed string without ever touching
 * `Math.random()` -- `selectNext`'s `assignment_id` (engine.ts) and
 * `assembleAssignment`'s item rotation (assemble.ts) both go through this
 * single implementation rather than each growing their own, so "same seed
 * -> same output" only has one code path to stay true. FNV-1a, 32-bit.
 */
export function hash(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Same hash, as a non-negative integer -- for modulo-based rotation. */
export function hashInt(seed: string): number {
  return parseInt(hash(seed), 36);
}
