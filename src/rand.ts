/**
 * A value in [0, 1) from an index and a seed — stateless, so a dot's size is a
 * pure function of which dot it is. No generator to hold and no order to get
 * right: the tracks can be built, rebuilt, or drawn out of sequence and every
 * dot keeps the size it had, which is what makes the scatter read as placed by
 * hand rather than reshuffled on every mount.
 */
export function hash01(i: number, seed: number): number {
  const a = (Math.imul(i, 0x9e3779b1) + seed) >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
