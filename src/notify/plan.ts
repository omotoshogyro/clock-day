import {
  dateAt,
  dayKeyOf,
  formatDuration,
  formatRange,
  formatTime,
  shiftDayKey,
  sweepMin,
} from "../time";
import { notifyOn, type DayPlan } from "../store/types";

/**
 * Which reminders *should* exist right now. Pure — no native imports, no
 * clock of its own — so every rule below can be checked by logging the result
 * instead of by waiting for a fire time. That is the whole reason this is
 * split from the scheduler.
 */

export type Candidate = {
  /** Stable, so a scheduled set can be read back and understood. */
  id: string;
  at: Date;
  title: string;
  body: string;
  dayKey: string;
  rangeId: string;
  kind: "start" | "end";
};

/**
 * iOS keeps at most 64 pending requests per app and silently drops the rest.
 * Sitting a little under it leaves room for anything scheduled outside here.
 */
const MAX_PENDING = 56;

export function planNotifications(
  byDay: Record<string, DayPlan>,
  leadMin: number,
  now: Date
): Candidate[] {
  const today = dayKeyOf(now);
  const horizonEnd = dateAt(shiftDayKey(today, 2), 0).getTime(); // end of tomorrow
  const floor = now.getTime() + 1000;

  const out: Candidate[] = [];

  // Three days, not two. A range on the day *after* tomorrow starting at 00:05
  // with a 15-minute lead fires at 23:50 tomorrow — inside the horizon, on a
  // day we would never have looked at. Filtering by fire time rather than by
  // owning day is what makes the window honest.
  for (let d = 0; d <= 2; d += 1) {
    const key = shiftDayKey(today, d);
    const plan = byDay[key];
    if (!plan || !notifyOn(plan)) continue;

    for (const r of plan.ranges) {
      const total = sweepMin(r.startMin, r.endMin);
      if (total <= 0) continue;

      const startAt = dateAt(key, r.startMin - leadMin);
      // Never r.endMin: for a 23:00->01:00 range that is 60, which would put
      // the end notification at 1am *that morning* — 22 hours in the past, and
      // a past trigger fires immediately.
      const endAt = dateAt(key, r.startMin + total);

      const label = r.title.trim();
      const span = formatRange(r.startMin, r.endMin);

      out.push({
        id: `${key}:${r.id}:start`,
        at: startAt,
        // An unnamed band falls back to its time rather than to "Untitled" —
        // still useful, and iOS renders a bare body with no heading if the
        // title is empty.
        title: label || formatTime(r.startMin),
        body:
          leadMin > 0
            ? `Starts in ${formatDuration(leadMin)} · ${span}`
            : `Starting now · ${span}`,
        dayKey: key,
        rangeId: r.id,
        kind: "start",
      });

      out.push({
        id: `${key}:${r.id}:end`,
        at: endAt,
        title: label || formatTime(r.startMin + total),
        body: `Wrapping up · ${span}`,
        dayKey: key,
        rangeId: r.id,
        kind: "end",
      });
    }
  }

  return out
    .filter((c) => {
      const t = c.at.getTime();
      return t > floor && t < horizonEnd;
    })
    // Soonest first, so the truncation below drops the furthest-out — which the
    // next reschedule picks up anyway.
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, MAX_PENDING);
}

/** Cheap identity for "is this the same set of reminders as last time". */
export function planKey(list: Candidate[]): string {
  return list.map((c) => `${c.id}@${c.at.getTime()}`).join("|");
}
