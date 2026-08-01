import { useEffect } from "react";
import { AppState } from "react-native";
import {
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

const MS_PER_DAY = 86_400_000;

export type Now = {
  /** Local milliseconds-since-midnight, fractional. Lives on the UI thread. */
  msOfDay: SharedValue<number>;
};

/**
 * Keeps a smooth, drift-free clock on the UI thread without re-rendering React.
 *
 * `useFrameCallback` gives monotonic frame time; the epoch is sampled on the JS
 * thread and rebased whenever the app returns to the foreground (frame time
 * stalls while backgrounded, and the timezone offset can change across DST).
 *
 * Under reduced motion the frame loop is off and a 1s interval ticks instead,
 * so the second hand steps rather than sweeps.
 */
export function useNow(reduceMotion: boolean): Now {
  const msOfDay = useSharedValue(0);

  const epochBase = useSharedValue(0); // local ms at the last rebase
  const frameBase = useSharedValue(0); // frame time at the last rebase
  const pendingEpoch = useSharedValue(0);
  const resync = useSharedValue(1); // 1 = rebase on the next frame

  // Sample the wall clock (and the current UTC offset) on the JS thread.
  useEffect(() => {
    const sample = () => {
      const utc = Date.now();
      const local = utc - new Date(utc).getTimezoneOffset() * 60_000;
      pendingEpoch.value = local;
      resync.value = 1;
      if (reduceMotion) msOfDay.value = local % MS_PER_DAY;
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

  useFrameCallback((frame) => {
    "worklet";
    if (resync.value === 1) {
      epochBase.value = pendingEpoch.value;
      frameBase.value = frame.timeSinceFirstFrame;
      resync.value = 0;
    }
    const elapsed = frame.timeSinceFirstFrame - frameBase.value;
    msOfDay.value = (epochBase.value + elapsed) % MS_PER_DAY;
  }, !reduceMotion);

  return { msOfDay };
}

/** Hand angles in degrees, -90 at 12 o'clock. */
export function useHandAngles(now: Now) {
  const second = useDerivedValue(() => {
    "worklet";
    const s = (now.msOfDay.value / 1000) % 60;
    return (s / 60) * 360 - 90;
  });
  const minute = useDerivedValue(() => {
    "worklet";
    const m = (now.msOfDay.value / 60_000) % 60;
    return (m / 60) * 360 - 90;
  });
  const hour = useDerivedValue(() => {
    "worklet";
    const h = (now.msOfDay.value / 3_600_000) % 12;
    return (h / 12) * 360 - 90;
  });
  return { second, minute, hour };
}
