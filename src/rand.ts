/**
 * mulberry32 — a tiny deterministic PRNG. Seeding from the date means the
 * calendar's coloured rings are stable across re-renders and app restarts
 * instead of reshuffling every time the grid mounts.
 */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The same mixing step, but stateless: a value in [0, 1) from an index and a
 * seed. Where `mulberry32` gives a *sequence* — order matters, and you have to
 * hold the generator — this gives one dot its size without caring when or in
 * what order it is asked for.
 */
export function hash01(i: number, seed: number): number {
  const a = (Math.imul(i, 0x9e3779b1) + seed) >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
