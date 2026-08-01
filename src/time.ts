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

// ---- Calendar helpers (JS thread only) ---------------------------------

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
