import { Skia, type SkPath } from "@shopify/react-native-skia";

import { CX, CY, R_AM, R_PM, BAND } from "./constants";
import {
  MIN_PER_DAY,
  MIN_PER_TURN,
  angleOf,
  normMin,
  ringOf,
  sweepMin,
  type Ring,
} from "./time";

export const RING_R: [number, number] = [R_AM, R_PM];

export function radiusOf(ring: Ring): number {
  "worklet";
  return ring === 1 ? R_PM : R_AM;
}

// ---- Arc segmentation --------------------------------------------------

export type Segment = {
  ring: Ring;
  /** Un-normalised so `angleOf` stays monotonic across the segment. */
  fromMin: number;
  toMin: number;
};

/**
 * Cut a range into per-track pieces at every 12-hour boundary.
 *
 *   11:00 -> 13:00  =>  [{ ring 0, 660..720 }, { ring 1, 720..780 }]
 *
 * A range that wraps midnight or spans more than 12 hours simply produces
 * more pieces. Used identically by the big clock and the calendar mini-rings.
 */
export function segmentsFor(startMin: number, endMin: number): Segment[] {
  const total = sweepMin(startMin, endMin);
  if (total <= 0) return [];

  const segs: Segment[] = [];
  let cursor = normMin(startMin);
  let remaining = total;
  let guard = 0;

  while (remaining > 1e-6 && guard < 8) {
    guard += 1;
    const ring = ringOf(cursor);
    const boundary = ring === 0 ? MIN_PER_TURN : MIN_PER_DAY;
    const take = Math.min(remaining, boundary - cursor);
    segs.push({ ring, fromMin: cursor, toMin: cursor + take });
    cursor = normMin(cursor + take);
    remaining -= take;
  }
  return segs;
}

/** Does `min` fall inside [start, end) walking forward, wrapping midnight? */
export function rangeContains(
  startMin: number,
  endMin: number,
  min: number
): boolean {
  "worklet";
  const total = sweepMin(startMin, endMin);
  if (total <= 0) return false;
  return sweepMin(startMin, min) <= total;
}

/**
 * Which band a touch lands on.
 *
 * Walks backwards on purpose: `RangeArcs` paints in array order, so the *last*
 * matching range is the one drawn on top. Searching forwards would hand a touch
 * to a band buried underneath, leaving the one you can actually see permanently
 * unselectable — and with it unnameable, unmovable and undeletable. Paint order
 * and hit order are two halves of one rule; keep them together.
 */
export function topmostAt(
  list: { id: string; startMin: number; endMin: number }[],
  min: number
): string | null {
  "worklet";
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (rangeContains(list[i].startMin, list[i].endMin, min)) return list[i].id;
  }
  return null;
}

/** How many minutes of track one pixel of arc covers, per ring. */
export function minutesPerPx(ring: Ring): number {
  "worklet";
  return MIN_PER_TURN / (2 * Math.PI * radiusOf(ring));
}

/**
 * `rangeContains` with slack on both ends.
 *
 * A short range's *label* is wider than its arc: a 20-minute range on the AM
 * track is ~20px long, while the pill drawn over it is ~50px. Half the thing
 * you can see is therefore outside the range in minute terms, and a tap there
 * would fall through to "empty track". Padding the test by a few pixels' worth
 * of minutes makes the visible shape the hit target.
 */
export function rangeNear(
  startMin: number,
  endMin: number,
  min: number,
  padMin: number
): boolean {
  "worklet";
  const total = sweepMin(startMin, endMin);
  if (total <= 0) return false;
  return sweepMin(normMin(startMin - padMin), min) <= total + padMin * 2;
}

// ---- Paths -------------------------------------------------------------

const DEG = 180 / Math.PI;

/**
 * A filled ring segment with its four corners rounded — the highlighter shape.
 *
 * Stroking an arc with a round cap gives a capsule: the cap is a full
 * semicircle, so there is no flat edge. What we want is the band cut *radially*
 * with softened corners, which means building the sector as a fill.
 *
 * Skia's CornerPathEffect can't do it — it only rounds line-to-line joins and
 * passes curve verbs through untouched, and every corner here is an arc meeting
 * a line. So each corner is a quadratic Bézier whose control point is the sharp
 * vertex; at these radii that is indistinguishable from a circular fillet.
 *
 * Declared above its callers, and with the centre resolved in the body rather
 * than via default parameters — both are requirements of the worklets
 * transform, which otherwise captures neither.
 */
export function sectorPath(
  rMid: number,
  fromDeg: number,
  sweepDeg: number,
  halfWidth: number,
  corner: number,
  cx?: number,
  cy?: number
): SkPath {
  "worklet";
  const ox = cx === undefined ? CX : cx;
  const oy = cy === undefined ? CY : cy;

  const ri = rMid - halfWidth;
  const ro = rMid + halfWidth;
  const sweep = Math.abs(sweepDeg);
  const a0 = sweepDeg < 0 ? fromDeg + sweepDeg : fromDeg;
  const a1 = a0 + sweep;

  // Keep the fillets from meeting in the middle of a short segment, which would
  // fold the path in on itself. The draft arc sweeps up from ~0 on every drag,
  // so this clamp is load-bearing, not defensive.
  const innerArc = (sweep / DEG) * ri;
  const c = Math.max(0, Math.min(corner, halfWidth, innerArc * 0.45));

  const p = Skia.Path.Make();
  if (sweep <= 0 || ri <= 0) return p;

  const ao = (c / ro) * DEG; // angular inset of a corner on the outer edge
  const ai = (c / ri) * DEG; // ...and on the inner edge
  const outer = { x: ox - ro, y: oy - ro, width: ro * 2, height: ro * 2 };
  const inner = { x: ox - ri, y: oy - ri, width: ri * 2, height: ri * 2 };

  const px = (r: number, deg: number) => ox + Math.cos(deg / DEG) * r;
  const py = (r: number, deg: number) => oy + Math.sin(deg / DEG) * r;

  p.moveTo(px(ro, a0 + ao), py(ro, a0 + ao));
  p.arcToOval(outer, a0 + ao, sweep - ao * 2, false);
  p.quadTo(px(ro, a1), py(ro, a1), px(ro - c, a1), py(ro - c, a1));
  p.lineTo(px(ri + c, a1), py(ri + c, a1));
  p.quadTo(px(ri, a1), py(ri, a1), px(ri, a1 - ai), py(ri, a1 - ai));
  p.arcToOval(inner, a1 - ai, -(sweep - ai * 2), false);
  p.quadTo(px(ri, a0), py(ri, a0), px(ri + c, a0), py(ri + c, a0));
  p.lineTo(px(ro - c, a0), py(ro - c, a0));
  p.quadTo(px(ro, a0), py(ro, a0), px(ro, a0 + ao), py(ro, a0 + ao));
  p.close();
  return p;
}

/**
 * Arc on the circle of radius `r`. Angles are Skia's: degrees, 0 at 3 o'clock,
 * positive clockwise — the same convention `angleOf` produces.
 *
 * `reversed` flips the direction of travel without changing the drawn shape.
 * It only matters for <TextPath>, where glyphs stand perpendicular to the
 * direction of travel: an arc across the bottom of the circle must run
 * counter-clockwise or its label renders upside down.
 */
export function arcPath(
  r: number,
  fromDeg: number,
  sweepDeg: number,
  reversed = false,
  cx = CX,
  cy = CY
): SkPath {
  const p = Skia.Path.Make();
  const oval = { x: cx - r, y: cy - r, width: r * 2, height: r * 2 };
  if (reversed) p.addArc(oval, fromDeg + sweepDeg, -sweepDeg);
  else p.addArc(oval, fromDeg, sweepDeg);
  return p;
}

export function segmentPath(seg: Segment, reversed = false): SkPath {
  const from = angleOf(seg.fromMin);
  const sweep = ((seg.toMin - seg.fromMin) / MIN_PER_TURN) * 360;
  return arcPath(radiusOf(seg.ring), from, sweep, reversed);
}

export function segmentSweepDeg(seg: Segment): number {
  return ((seg.toMin - seg.fromMin) / MIN_PER_TURN) * 360;
}

export function segmentMidDeg(seg: Segment): number {
  return angleOf((seg.fromMin + seg.toMin) / 2);
}

/**
 * True when the segment's midpoint sits in the lower half of the dial, where
 * a clockwise label would read upside down.
 */
export function needsReverse(seg: Segment): boolean {
  const mid = ((segmentMidDeg(seg) % 360) + 360) % 360;
  return mid > 0 && mid < 180;
}

export function arcLength(r: number, sweepDeg: number): number {
  return (Math.abs(sweepDeg) * Math.PI * r) / 180;
}

export function pointOnDial(
  min: number,
  r: number,
  cx?: number,
  cy?: number
): { x: number; y: number } {
  "worklet";
  // The centre defaults are resolved in the body, never in the parameter list:
  // the worklets transform captures identifiers referenced from a function's
  // body but not from default-parameter expressions, so `cx = CX` reads as
  // undefined once this runs on the UI thread.
  const ox = cx === undefined ? CX : cx;
  const oy = cy === undefined ? CY : cy;
  const rad = (angleOf(min) * Math.PI) / 180;
  return { x: ox + Math.cos(rad) * r, y: oy + Math.sin(rad) * r };
}

// ---- Hit testing (UI thread) -------------------------------------------

export type Hit = { ring: Ring; min: number } | null;

/**
 * Map a touch inside the canvas to a track + minute, or null if the touch
 * landed on the face or out past the rim. Tolerance is the arc thickness, so
 * the grabbable band is roughly a fingertip wide.
 *
 * Resolves to whichever centreline is *nearer* rather than to the first one in
 * range: once the band is wide enough that the two tolerances overlap, a
 * first-match test hands every touch in the overlap to the AM track even when
 * the finger is plainly closer to PM.
 */
export function hitTrack(x: number, y: number): Hit {
  "worklet";
  const dx = x - CX;
  const dy = y - CY;
  const r = Math.sqrt(dx * dx + dy * dy);

  const dAm = Math.abs(r - R_AM);
  const dPm = Math.abs(r - R_PM);
  if (Math.min(dAm, dPm) > BAND / 2 + 4) return null;
  const ring: Ring = dAm <= dPm ? 0 : 1;

  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const within = ((((deg + 90) % 360) + 360) % 360 / 360) * MIN_PER_TURN;
  return { ring, min: (ring === 1 ? MIN_PER_TURN : 0) + within };
}

/** Distance from a touch to a given minute's position on its track. */
export function distToMinute(x: number, y: number, min: number): number {
  "worklet";
  const p = pointOnDial(min, radiusOf(ringOf(min)));
  const dx = x - p.x;
  const dy = y - p.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Raw touch angle in the same convention as `angleOf` (-90 = 12 o'clock). */
export function angleAtPoint(x: number, y: number): number {
  "worklet";
  return (Math.atan2(y - CY, x - CX) * 180) / Math.PI;
}

/** Shortest signed difference `to - from`, in (-180, 180]. */
export function deltaDeg(to: number, from: number): number {
  "worklet";
  let d = (to - from) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Degrees of accumulated rotation -> minutes. The drag unwraps its angle
 * rather than re-reading the radius, so continuing clockwise past 12 rolls the
 * range onto the next track instead of snapping back.
 */
export function degToMin(deg: number): number {
  "worklet";
  return (deg / 360) * MIN_PER_TURN;
}
