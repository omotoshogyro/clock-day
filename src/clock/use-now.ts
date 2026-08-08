import { useCallback, useEffect, useMemo } from "react";
import { AppState } from "react-native";
import {
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  type FrameInfo,
  type SharedValue,
} from "react-native-reanimated";

const MS_PER_DAY = 86_400_000;

/**
 * JS `%` keeps the sign of the dividend; the dial needs 0..MS_PER_DAY. Declared
 * above its callers for the worklets transform, like the helpers in geometry.ts.
 */
function wrapDay(ms: number) {
  "worklet";
  return ((ms % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY;
}

export type Now = {
  /** Local milliseconds-since-midnight, fractional. Lives on the UI thread. */
  msOfDay: SharedValue<number>;
};

/**
 * Keeps a smooth, drift-free clock on the UI thread without re-rendering React.
 *
 * The dial reads `epochBase + (frame clock - frameBase)`: a wall-clock sample
 * taken on the JS thread, carried forward by frame time. The epoch is rebased
 * whenever the app returns to the foreground — frames stop while backgrounded
 * (and the media clock stops across device sleep), and the timezone offset can
 * change across DST.
 *
 * The frame clock is `frame.timestamp`, deliberately, not
 * `frame.timeSinceFirstFrame`. The latter counts from the first frame after the
 * *callback was registered*, and Reanimated re-registers whenever the callback's
 * identity changes — so with an inline worklet it fell back to 0 on every React
 * render and rewound the hands to the launch time. `timestamp` comes straight
 * off the display link and knows nothing about registration, which makes the
 * maths independent of render churn.
 *
 * Under reduced motion the frame loop is off and a 1s interval ticks instead,
 * so the second hand steps rather than sweeps.
 */
export function useNow(reduceMotion: boolean): Now {
  const msOfDay = useSharedValue(0);

  const epochBase = useSharedValue(0); // local ms at the last rebase
  const frameBase = useSharedValue(0); // frame timestamp at the last rebase
  const pendingEpoch = useSharedValue(0);
  const resync = useSharedValue(1); // 1 = rebase on the next frame

  // Sample the wall clock (and the current UTC offset) on the JS thread.
  useEffect(() => {
    const sample = () => {
      const utc = Date.now();
      const local = utc - new Date(utc).getTimezoneOffset() * 60_000;
      pendingEpoch.value = local;
      resync.value = 1;
      if (reduceMotion) msOfDay.value = wrapDay(local);
    };

    sample();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") sample();
    });

    let interval: ReturnType<typeof setInterval> | undefined;
    if (reduceMotion) interval = setInterval(sample, 1000);

    return () => {
      sub.remove();
      if (interval) clearInterval(interval);
    };
  }, [reduceMotion, pendingEpoch, resync, msOfDay]);

  // Pinned to its first identity on purpose: useFrameCallback re-registers
  // whenever the callback changes, and re-registering tears down and restarts
  // the whole UI-thread frame loop — a dropped frame per keystroke. Everything
  // captured below is either a shared value (a stable hook slot, so the UI side
  // always sees the live mutable) or a module constant, so the frozen closure
  // cannot go stale. Anything added here that is neither must be read through a
  // shared value instead, or it will be stuck at its first value.
  const tick = useCallback((frame: FrameInfo) => {
    "worklet";
    if (resync.value === 1) {
      epochBase.value = pendingEpoch.value;
      frameBase.value = frame.timestamp;
      resync.value = 0;
    }
    const elapsed = frame.timestamp - frameBase.value;
    msOfDay.value = wrapDay(epochBase.value + elapsed);
  }, []);

  useFrameCallback(tick, !reduceMotion);

  // useDerivedValue keys its mapper on whatever the worklet captured, so a fresh
  // wrapper here would stop and restart every hand's mapper on every render.
  return useMemo(() => ({ msOfDay }), [msOfDay]);
}

/** Hand angles in degrees, -90 at 12 o'clock. */
export function useHandAngles(now: Now) {
  // Close over the shared value rather than the wrapper: the mappers below key
  // on what their worklet captured, so this keeps them stable no matter how the
  // caller built `now`.
  const { msOfDay } = now;

  const second = useDerivedValue(() => {
    "worklet";
    const s = (msOfDay.value / 1000) % 60;
    return (s / 60) * 360 - 90;
  });
  const minute = useDerivedValue(() => {
    "worklet";
    const m = (msOfDay.value / 60_000) % 60;
    return (m / 60) * 360 - 90;
  });
  const hour = useDerivedValue(() => {
    "worklet";
    const h = (msOfDay.value / 3_600_000) % 12;
    return (h / 12) * 360 - 90;
  });
  return { second, minute, hour };
}
