import { Circle, Group, Skia } from "@shopify/react-native-skia";
import { Path } from "@shopify/react-native-skia";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";

import {
  ARC_CORNER_R,
  BAND,
  CX,
  CY,
  HANDLE_R,
  R_AM,
  R_PM,
} from "../constants";
import { sectorPath } from "../geometry";
import { MIN_PER_DAY, MIN_PER_TURN } from "../time";
import type { Theme } from "../theme";

/**
 * Declared above its callers deliberately — the worklets transform resolves a
 * helper at capture time, so a forward reference is undefined on the UI thread.
 */
function dialPoint(min: number) {
  "worklet";
  let m = min % MIN_PER_DAY;
  if (m < 0) m += MIN_PER_DAY;
  const r = m < MIN_PER_TURN ? R_AM : R_PM;
  const rad = (((m % MIN_PER_TURN) / MIN_PER_TURN) * 360 - 90) * (Math.PI / 180);
  return { x: CX + Math.cos(rad) * r, y: CY + Math.sin(rad) * r };
}

/**
 * The draft as filled sectors, one per 12-hour track it spans. Also declared
 * above its callers for the worklets transform.
 */
function draftSectors(
  startMin: number,
  sweep: number,
  halfWidth: number,
  corner: number
) {
  "worklet";
  const p = Skia.Path.Make();

  let cursor = startMin % MIN_PER_DAY;
  if (cursor < 0) cursor += MIN_PER_DAY;
  let remaining = sweep;
  let guard = 0;

  while (remaining > 1e-6 && guard < 8) {
    guard += 1;
    const ring = cursor < MIN_PER_TURN ? 0 : 1;
    const boundary = ring === 0 ? MIN_PER_TURN : MIN_PER_DAY;
    const take = Math.min(remaining, boundary - cursor);
    const r = ring === 1 ? R_PM : R_AM;
    const fromDeg = ((cursor % MIN_PER_TURN) / MIN_PER_TURN) * 360 - 90;
    const sweepDeg = (take / MIN_PER_TURN) * 360;
    p.addPath(sectorPath(r, fromDeg, sweepDeg, halfWidth, corner));
    cursor = (cursor + take) % MIN_PER_DAY;
    remaining -= take;
  }
  return p;
}

export type Draft = {
  /** 0 idle, 1 while the finger is down or a range is being resized. */
  active: SharedValue<number>;
  startMin: SharedValue<number>;
  /** Forward sweep in minutes, always >= 0. */
  sweepMin: SharedValue<number>;
};

type Props = {
  draft: Draft;
  fill: string;
  edge: string;
  theme: Theme;
};

/**
 * The arc under the finger. Everything here is derived from shared values, so
 * a drag never touches React — the path is rebuilt on the UI thread each frame
 * and the committed arcs underneath stay untouched.
 */
export function DraftArc({ draft, fill, edge, theme }: Props) {
  const path = useDerivedValue(() => {
    "worklet";
    if (draft.active.value === 0) return Skia.Path.Make();
    return draftSectors(
      draft.startMin.value,
      draft.sweepMin.value,
      BAND / 2,
      ARC_CORNER_R
    );
  });

  const edgePath = useDerivedValue(() => {
    "worklet";
    if (draft.active.value === 0) return Skia.Path.Make();
    return draftSectors(
      draft.startMin.value,
      draft.sweepMin.value,
      BAND / 2 + 1.5,
      ARC_CORNER_R + 1.5
    );
  });

  const startPos = useDerivedValue(() => {
    "worklet";
    return dialPoint(draft.startMin.value);
  });
  const endPos = useDerivedValue(() => {
    "worklet";
    return dialPoint(draft.startMin.value + draft.sweepMin.value);
  });

  const startX = useDerivedValue(() => startPos.value.x);
  const startY = useDerivedValue(() => startPos.value.y);
  const endX = useDerivedValue(() => endPos.value.x);
  const endY = useDerivedValue(() => endPos.value.y);
  const opacity = useDerivedValue(() => draft.active.value);

  return (
    <Group opacity={opacity}>
      <Path path={edgePath} color={edge} />
      <Path path={path} color={fill} />
      <Circle cx={startX} cy={startY} r={HANDLE_R} color={edge} />
      <Circle cx={endX} cy={endY} r={HANDLE_R} color={edge} />
      <Circle cx={startX} cy={startY} r={HANDLE_R - 3.5} color={theme.faceBg} />
      <Circle cx={endX} cy={endY} r={HANDLE_R - 3.5} color={theme.faceBg} />
    </Group>
  );
}
