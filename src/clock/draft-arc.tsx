import { Circle, Group, RoundedRect, Skia, Text } from "@shopify/react-native-skia";
import { Path } from "@shopify/react-native-skia";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";

import {
  ARC_CORNER_R,
  BAND,
  CX,
  CY,
  DRAG_ALPHA,
  HANDLE_R,
  PILL_H,
  R_AM,
  R_PM,
} from "../constants";
import { sectorPath } from "../geometry";
import { MIN_PER_DAY, MIN_PER_TURN } from "../time";
import type { Theme } from "../theme";
import type { DialFonts } from "./fonts";

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
  /** 0 idle, 1 whenever the draft is standing in for a range. */
  active: SharedValue<number>;
  /**
   * 1 only while the finger is actually driving the band. Distinct from
   * `active`, which stays 1 after a create so the draft can hold the range's
   * place while its name is open — and that band should look settled.
   */
  live: SharedValue<number>;
  startMin: SharedValue<number>;
  /** Forward sweep in minutes, always >= 0. */
  sweepMin: SharedValue<number>;
  /**
   * 0 unless the draft stands in for a range that already has a name — i.e. a
   * move. A range being *drawn* has no title to show yet.
   */
  labelOn: SharedValue<number>;
};

/** A title pre-measured on the JS thread; offsets are relative to the midpoint. */
export type DraftLabel = {
  text: string;
  w: number;
  tx: number;
  ty: number;
};

type Props = {
  draft: Draft;
  fill: string;
  edge: string;
  label: DraftLabel | null;
  ink: string;
  fonts: DialFonts;
  theme: Theme;
};

/**
 * The arc under the finger. Everything here is derived from shared values, so
 * a drag never touches React — the path is rebuilt on the UI thread each frame
 * and the committed arcs underneath stay untouched.
 */
export function DraftArc({
  draft,
  fill,
  edge,
  label,
  ink,
  fonts,
  theme,
}: Props) {
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
  // Translucent only while in hand, so the track underneath stays readable
  // while you position it. The label pill nests inside this group and fades
  // with it — a solid label on a faded band reads as a rendering fault.
  const opacity = useDerivedValue(
    () => draft.active.value * (draft.live.value ? DRAG_ALPHA : 1)
  );

  // Always the pill form, even for a range whose committed label is curved
  // text: rebuilding a text path every frame on the UI thread is not worth the
  // one frame it saves on release.
  const midPos = useDerivedValue(() => {
    "worklet";
    return dialPoint(draft.startMin.value + draft.sweepMin.value / 2);
  });
  const labelW = label?.w ?? 0;
  const labelTx = label?.tx ?? 0;
  const labelTy = label?.ty ?? 0;
  const pillX = useDerivedValue(() => midPos.value.x - labelW / 2);
  const pillY = useDerivedValue(() => midPos.value.y - PILL_H / 2);
  const textX = useDerivedValue(() => midPos.value.x + labelTx);
  const textY = useDerivedValue(() => midPos.value.y + labelTy);
  const labelOpacity = useDerivedValue(
    () => draft.active.value * draft.labelOn.value
  );

  return (
    <Group opacity={opacity}>
      <Path path={edgePath} color={edge} />
      <Path path={path} color={fill} />
      <Circle cx={startX} cy={startY} r={HANDLE_R} color={edge} />
      <Circle cx={endX} cy={endY} r={HANDLE_R} color={edge} />
      <Circle cx={startX} cy={startY} r={HANDLE_R - 3.5} color={theme.faceBg} />
      <Circle cx={endX} cy={endY} r={HANDLE_R - 3.5} color={theme.faceBg} />
      {label && (
        <Group opacity={labelOpacity}>
          <RoundedRect
            x={pillX}
            y={pillY}
            width={labelW}
            height={PILL_H}
            r={PILL_H / 2}
            color={fill}
          />
          <Text x={textX} y={textY} text={label.text} font={fonts.mini} color={ink} />
        </Group>
      )}
    </Group>
  );
}
