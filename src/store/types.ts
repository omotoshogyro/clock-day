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

export type StickerItem = {
  id: string;
  kind: "heart";
  /** Screen-space angle on the dial, degrees (-90 = 12 o'clock). */
  angleDeg: number;
  radius: number;
};

export type DayPlan = {
  ranges: RangeItem[];
  stickers: StickerItem[];
};

export const EMPTY_DAY: DayPlan = { ranges: [], stickers: [] };
