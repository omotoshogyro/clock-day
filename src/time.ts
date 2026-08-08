/**
 * Everything in Clockday reduces to *minute-of-day*, 0…1439.
 *
 * The dial shows 12 hours, so a day needs two concentric tracks:
 *   ring 0 = AM = minutes    0…719   (inner)
 *   ring 1 = PM = minutes  720…1439  (outer)
 *
 * Every function here is pure math and marked "worklet" so it can be called
 * from the gesture handler on the UI thread as well as from React.
 */

export const MIN_PER_DAY = 1440;
export const MIN_PER_TURN = 720; // one full sweep of the 12-hour dial
export const SNAP = 5; // minutes the drag snaps to

export type Ring = 0 | 1;

/**
 * Declared before its callers on purpose: the worklets transform rewrites each
 * "worklet" function and captures what it references, so a forward reference
 * to a later declaration resolves to undefined on the UI thread.
 */
function pad2(n: number): string {
  "worklet";
  return n < 10 ? `0${n}` : `${n}`;
}

/** Which track a minute-of-day lives on. */
export function ringOf(min: number): Ring {
  "worklet";
  return min % MIN_PER_DAY < MIN_PER_TURN ? 0 : 1;
}

/** Screen-space angle in degrees for a minute. 12 o'clock is -90, clockwise. */
export function angleOf(min: number): number {
  "worklet";
  const m = ((min % MIN_PER_TURN) + MIN_PER_TURN) % MIN_PER_TURN;
  return (m / MIN_PER_TURN) * 360 - 90;
}

/** Inverse of `angleOf`. The ring supplies the missing 12 hours. */
export function minuteAt(angleDeg: number, ring: Ring): number {
  "worklet";
  const a = ((angleDeg + 90) % 360 + 360) % 360;
  const within = (a / 360) * MIN_PER_TURN;
  return (ring === 1 ? MIN_PER_TURN : 0) + within;
}

export function snapMin(min: number): number {
  "worklet";
  return (Math.round(min / SNAP) * SNAP) % MIN_PER_DAY;
}

/** Forward distance from `a` to `b`, wrapping midnight. Always 0…1439. */
export function sweepMin(a: number, b: number): number {
  "worklet";
  const d = (b - a) % MIN_PER_DAY;
  return d < 0 ? d + MIN_PER_DAY : d;
}

export function normMin(min: number): number {
  "worklet";
  const m = min % MIN_PER_DAY;
  return m < 0 ? m + MIN_PER_DAY : m;
}

/** "5am" · "6:15am" · "12:30am" · "7pm" — matches the reference readout. */
export function formatTime(min: number): string {
  "worklet";
  const m = Math.round(normMin(min));
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h24 < 12 ? "am" : "pm";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return mm === 0 ? `${h12}${suffix}` : `${h12}:${pad2(mm)}${suffix}`;
}

export function formatRange(a: number, b: number): string {
  "worklet";
  return `${formatTime(a)} – ${formatTime(b)}`;
}

/** "20m" · "2h" · "1h 30m". */
export function formatDuration(mins: number): string {
  "worklet";
  const m = Math.round(mins);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

/**
 * "5am – 7am · 2h". Written from the pan during a drag, so it stays a worklet.
 * The zero guard matters: a create begins with start === end, and without it
 * the readout flashes "· 0m" on every touch-down.
 */
export function formatRangeDetail(a: number, b: number): string {
  "worklet";
  const d = sweepMin(a, b);
  return d <= 0
    ? formatRange(a, b)
    : `${formatRange(a, b)} · ${formatDuration(d)}`;
}

// ---- Calendar helpers (JS thread only) ---------------------------------

/**
 * Total minutes covered by a day's ranges, counting overlaps once.
 *
 * Summing sweeps would double-count exactly on the days where two bands sit on
 * top of each other, so project each onto a flat line, merge, then measure.
 * A wrapping range runs past MIN_PER_DAY, hence the 0…2*MIN_PER_DAY span.
 */
export function plannedMinutes(
  ranges: { startMin: number; endMin: number }[]
): number {
  if (ranges.length === 0) return 0;

  const spans = ranges
    .map((r) => ({ from: r.startMin, to: r.startMin + sweepMin(r.startMin, r.endMin) }))
    .filter((s) => s.to > s.from)
    .sort((a, b) => a.from - b.from);
  if (spans.length === 0) return 0;

  let total = 0;
  let { from, to } = spans[0];
  for (let i = 1; i < spans.length; i += 1) {
    const s = spans[i];
    if (s.from > to) {
      total += to - from;
      from = s.from;
      to = s.to;
    } else if (s.to > to) {
      to = s.to;
    }
  }
  total += to - from;
  return Math.min(total, MIN_PER_DAY);
}

export const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
export const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Stable "YYYY-MM-DD" key. month is 0-indexed, matching Date. */
export function dayKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

export function dayKeyOf(d: Date): string {
  return dayKey(d.getFullYear(), d.getMonth(), d.getDate());
}

export function parseDayKey(key: string): {
  year: number;
  month: number;
  day: number;
} {
  const [y, m, d] = key.split("-").map(Number);
  return { year: y, month: m - 1, day: d };
}

/**
 * A local `Date` for a minute-of-day on a given day.
 *
 * The component constructor deliberately, not `midnightMs + min * 60_000`:
 * across a daylight-saving boundary the day is not 1440 minutes long, so the
 * arithmetic form is an hour out twice a year — in a way that will not
 * reproduce when you go looking for it.
 *
 * It also normalises out of range in both directions, which is load-bearing
 * here rather than incidental. Past 1439 rolls into the next day, which is how
 * a range that wraps midnight gets its end; below 0 rolls into the previous
 * one, which is how a lead time on an 00:05 start lands the night before.
 */
export function dateAt(key: string, min: number): Date {
  const { year, month, day } = parseDayKey(key);
  return new Date(year, month, day, 0, min, 0, 0);
}

export function shiftDayKey(key: string, days: number): string {
  const { year, month, day } = parseDayKey(key);
  return dayKeyOf(new Date(year, month, day + days));
}

/** "Wednesday 29" */
export function formatDayHeader(key: string): string {
  const { year, month, day } = parseDayKey(key);
  const d = new Date(year, month, day);
  return `${WEEKDAY_LONG[d.getDay()]} ${day}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * The 6x7 cells of a month grid, Sunday-first. Cells outside the month carry
 * `inMonth: false` so they can be dimmed like the reference.
 */
export type GridCell = {
  key: string;
  day: number;
  inMonth: boolean;
};

export function monthGrid(year: number, month: number): GridCell[] {
  const first = new Date(year, month, 1).getDay();
  const count = daysInMonth(year, month);
  const cells: GridCell[] = [];

  const prevCount = daysInMonth(year, month - 1);
  for (let i = first - 1; i >= 0; i--) {
    const day = prevCount - i;
    const d = new Date(year, month - 1, day);
    cells.push({
      key: dayKey(d.getFullYear(), d.getMonth(), day),
      day,
      inMonth: false,
    });
  }
  for (let day = 1; day <= count; day++) {
    cells.push({ key: dayKey(year, month, day), day, inMonth: true });
  }
  let next = 1;
  while (cells.length < 42) {
    const d = new Date(year, month + 1, next);
    cells.push({
      key: dayKey(d.getFullYear(), d.getMonth(), next),
      day: next,
      inMonth: false,
    });
    next += 1;
  }
  return cells;
}
