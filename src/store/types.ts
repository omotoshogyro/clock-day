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
};

export const EMPTY_DAY: DayPlan = { ranges: [] };
