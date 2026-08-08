import { Circle, Group, Path, Skia } from "@shopify/react-native-skia";
import { useEffect } from "react";
import {
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";

import { ARC_CORNER_R, BAND, CX, CY, R_AM, R_PM } from "../constants";
import { sectorPath } from "../geometry";
import { MIN_PER_DAY, MIN_PER_TURN } from "../time";
import type { Theme } from "../theme";

/** 11am to 1pm: two hours that cross noon, so one loop shows the AM→PM roll. */
const FROM_MIN = 11 * 60;
const SWEEP_MIN = 120;

const DRAW_MS = 1700;
const HOLD_MS = 900;

/**
 * Declared above its callers for the worklets transform, and shaped exactly
 * like `draftSectors` in draft-arc.tsx so the hint looks like what a real drag
 * produces rather than an approximation of it.
 */
function ghostSectors(startMin: number, sweep: number) {
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
    p.addPath(sectorPath(r, fromDeg, sweepDeg, BAND / 2, ARC_CORNER_R));
    cursor = (cursor + take) % MIN_PER_DAY;
    remaining -= take;
  }
  return p;
}

function dialPoint(min: number) {
  "worklet";
  let m = min % MIN_PER_DAY;
  if (m < 0) m += MIN_PER_DAY;
  const r = m < MIN_PER_TURN ? R_AM : R_PM;
  const rad = (((m % MIN_PER_TURN) / MIN_PER_TURN) * 360 - 90) * (Math.PI / 180);
  return { x: CX + Math.cos(rad) * r, y: CY + Math.sin(rad) * r };
}

/**
 * What an empty day says instead of nothing.
 *
 * A band paints itself along the track, pauses, and starts over. Deliberately
 * spanning noon: one loop teaches the draw gesture, that there are two tracks,
 * and that a range rolls from the inner one to the outer — which is the app's
 * least guessable behaviour and the only one with a haptic of its own.
 *
 * Mounted conditionally by the screen rather than gated by a flag in here, so
 * the repeating animation does not keep running invisibly on a full day.
 */
export function GhostHint({ theme }: { theme: Theme }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: DRAW_MS, easing: Easing.inOut(Easing.cubic) }),
        withTiming(1, { duration: HOLD_MS }),
        withTiming(0, { duration: 0 })
      ),
      -1
    );
  }, [progress]);

  // Under Reduce Motion withTiming snaps to its target, so the resting state is
  // the finished arc rather than an invisible one. The hint still reads.
  const path = useDerivedValue(() => {
    "worklet";
    const sweep = Math.max(1, SWEEP_MIN * progress.value);
    return ghostSectors(FROM_MIN, sweep);
  });

  const tip = useDerivedValue(() => {
    "worklet";
    return dialPoint(FROM_MIN + SWEEP_MIN * progress.value);
  });
  const tipX = useDerivedValue(() => tip.value.x);
  const tipY = useDerivedValue(() => tip.value.y);

  return (
    <Group opacity={0.5}>
      <Path path={path} color={theme.dot} />
      <Circle cx={tipX} cy={tipY} r={7} color={theme.dot} />
    </Group>
  );
}
