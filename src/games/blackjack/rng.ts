/**
 * Creates a seeded pseudo-random number generator (mulberry32).
 *
 * The game uses a seeded PRNG rather than Math.random so that a given seed
 * always produces the same shoe. That makes shuffles reproducible in tests and
 * lets a demo run be replayed exactly.
 *
 * @param seed Any 32-bit integer. The same seed always yields the same sequence.
 * @returns A function returning successive floats in the half-open range [0, 1).
 */
export function createRng(seed: number): () => number {
  let state = seed >>> 0 // Coerce to unsigned 32-bit; mulberry32 assumes uint32 state.

  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Returns a new array shuffled with Fisher-Yates using the supplied generator.
 *
 * @param items Source array. Not mutated.
 * @param rng Generator from `createRng`.
 * @returns A shuffled copy of `items`.
 */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items]

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const a = result[i]
    const b = result[j]
    // Guard satisfies noUncheckedIndexedAccess; both indices are always in range.
    if (a === undefined || b === undefined) continue
    result[i] = b
    result[j] = a
  }

  return result
}
