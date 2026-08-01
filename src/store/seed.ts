import { MARKERS, type MarkerId } from "../constants";
import { dayKey, daysInMonth } from "../time";
import type { DayPlan, RangeItem } from "./types";

/**
 * mulberry32 — a tiny deterministic PRNG. Seeding from the date means the
 * calendar's coloured rings are stable across re-renders and app restarts
 * instead of reshuffling every time the grid mounts.
 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TITLES = [
  "Beach",
  "Dinner",
  "Lunch",
  "Anne",
  "Gym",
  "Standup",
  "Focus",
  "School run",
  "Groceries",
  "Call mum",
  "Reading",
  "Party",
  "Walk",
  "Studio",
];

const MARKER_IDS: MarkerId[] = MARKERS.map((m) => m.id);

function seedForDay(year: number, month: number, day: number): number {
  return year * 10000 + (month + 1) * 100 + day;
}

/** A believable day: 1–4 non-overlapping blocks between 6am and 11pm. */
export function seedDay(year: number, month: number, day: number): DayPlan {
  const rand = mulberry32(seedForDay(year, month, day));
  const count = 1 + Math.floor(rand() * 4);

  const ranges: RangeItem[] = [];
  let cursor = 360 + Math.floor(rand() * 120); // start somewhere after 6am

  for (let i = 0; i < count; i += 1) {
    const durationMin = 30 + Math.floor(rand() * 8) * 30; // 30m … 4h
    if (cursor + durationMin > 23 * 60) break;

    ranges.push({
      id: `${dayKey(year, month, day)}-${i}`,
      startMin: cursor,
      endMin: cursor + durationMin,
      title: TITLES[Math.floor(rand() * TITLES.length)],
      markerId: MARKER_IDS[Math.floor(rand() * MARKER_IDS.length)],
    });

    cursor += durationMin + 30 + Math.floor(rand() * 6) * 30; // gap
  }

  return { ranges, stickers: [] };
}

export function seedMonth(
  year: number,
  month: number
): Record<string, DayPlan> {
  const out: Record<string, DayPlan> = {};
  const n = daysInMonth(year, month);
  for (let day = 1; day <= n; day += 1) {
    out[dayKey(year, month, day)] = seedDay(year, month, day);
  }
  return out;
}

/**
 * The day the app opens on gets the exact contents of the reference design so
 * the first screen is recognisable rather than random.
 */
export function seedShowcaseDay(key: string): DayPlan {
  return {
    ranges: [
      {
        id: `${key}-beach`,
        startMin: 5 * 60,
        endMin: 7 * 60,
        title: "Beach",
        markerId: "yellow",
      },
      {
        id: `${key}-dinner`,
        startMin: 19 * 60,
        endMin: 20 * 60 + 30,
        title: "Dinner",
        markerId: "pink",
      },
      {
        id: `${key}-anne`,
        startMin: 9 * 60,
        endMin: 9 * 60 + 20,
        title: "Anne",
        markerId: "blue",
      },
      {
        id: `${key}-lunch`,
        startMin: 12 * 60 + 30,
        endMin: 14 * 60,
        title: "Lunch",
        markerId: "pink",
      },
    ],
    stickers: [{ id: `${key}-heart`, kind: "heart", angleDeg: 0, radius: 152 }],
  };
}
