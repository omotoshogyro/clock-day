import { Circle, Group } from "@shopify/react-native-skia";
import { useMemo } from "react";
import { useDerivedValue } from "react-native-reanimated";

import { CX, CY, R_AM, R_PM } from "../constants";
import type { Theme } from "../theme";
import type { Now } from "./use-now";

const RAD = Math.PI / 180;
/**
 * Sits between the track's own scattered dots (1.1–3.0) and the hands' centre
 * cap (6.5), so it reads as placed rather than as one of the dots or as a rival
 * to the hub.
 */
const PIP_R = 5;

/**
 * Where "now" falls on the tracks.
 *
 * The hands already tell the time, but they live on the inner face and a
 * 12-hour hand cannot say which of the two tracks is the live one — 3pm and 3am
 * point the same way. This marks the current minute on whichever ring is
 * actually in play, so "what's next" is readable without doing the arithmetic.
 *
 * A dot *on* the track rather than a line *across* it: the line read as a
 * scratch on the screen, because a stroke cutting through a band says "divide
 * here" where a pip says "you are here".
 *
 * Both pips are static circles rotated by a derived transform, exactly like
 * ClockHands: nothing is allocated per frame and React never re-renders.
 */
export function NowMarker({ now, theme }: { now: Now; theme: Theme }) {
  const { msOfDay } = now;

  const transform = useDerivedValue(() => {
    "worklet";
    // One turn per 12 hours, matching the tracks rather than the 24-hour day.
    const turn = (msOfDay.value % 43_200_000) / 43_200_000;
    return [{ rotate: turn * 360 * RAD }];
  });

  // Only the live track shows its pip; the other is simply not drawn.
  const amOpacity = useDerivedValue(() => {
    "worklet";
    return msOfDay.value < 43_200_000 ? 1 : 0;
  });
  const pmOpacity = useDerivedValue(() => {
    "worklet";
    return msOfDay.value < 43_200_000 ? 0 : 1;
  });

  const origin = useMemo(() => ({ x: CX, y: CY }), []);

  return (
    <Group origin={origin} transform={transform}>
      {/* Drawn at 12 o'clock on each track's centreline; the Group above
          carries it round to the current minute. */}
      <Group opacity={amOpacity}>
        <Circle cx={CX} cy={CY - R_AM} r={PIP_R} color={theme.accent} />
      </Group>
      <Group opacity={pmOpacity}>
        <Circle cx={CX} cy={CY - R_PM} r={PIP_R} color={theme.accent} />
      </Group>
    </Group>
  );
}
