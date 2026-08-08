import type { MarkerId } from "../constants";

export type RangeItem = {
  id: string;
  /** minute-of-day, inclusive */
  startMin: number;
  /** minute-of-day, exclusive; may be < startMin when the range wraps midnight */
  endMin: number;
  title: string;
  markerId: MarkerId;
};

export type DayPlan = {
  ranges: RangeItem[];
  /**
   * Reminders for this day. Absent means the default, which is on — so muting
   * is the only thing ever written. Phrased positively rather than as `muted`
   * so that if the default ever flips, `notify ?? DEFAULT` still reads
   * correctly where `muted ?? !DEFAULT` is a double negative waiting to be
   * inverted in a refactor.
   */
  notify?: boolean;
};

/**
 * A module singleton, returned for any day that has never been written. Every
 * reducer path spreads it rather than assigning through it — keep it that way,
 * or one mutation silently changes every empty day at once.
 */
export const EMPTY_DAY: DayPlan = { ranges: [] };

export function notifyOn(plan: DayPlan): boolean {
  return plan.notify ?? true;
}

/** Nothing worth keeping: no ranges and no non-default setting. */
export function isDayEmpty(plan: DayPlan): boolean {
  return plan.ranges.length === 0 && plan.notify === undefined;
}
