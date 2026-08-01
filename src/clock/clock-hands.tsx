import { Circle, Group, Path, Skia } from "@shopify/react-native-skia";
import { useMemo } from "react";
import { useDerivedValue } from "react-native-reanimated";

import {
  CAP_R,
  CX,
  CY,
  HAND_HOUR_LEN,
  HAND_HOUR_W,
  HAND_MIN_LEN,
  HAND_MIN_W,
  HAND_SEC_LEN,
  HAND_SEC_TAIL,
  HAND_SEC_W,
} from "../constants";
import type { Theme } from "../theme";
import type { Now } from "./use-now";
import { useHandAngles } from "./use-now";

const RAD = Math.PI / 180;

/** A hand lying along +x from the centre; the Group rotation aims it. */
function handPath(len: number, tail: number) {
  const p = Skia.Path.Make();
  p.moveTo(CX - tail, CY);
  p.lineTo(CX + len, CY);
  return p;
}

export function ClockHands({ theme, now }: { theme: Theme; now: Now }) {
  const { hour, minute, second } = useHandAngles(now);

  const hourPath = useMemo(() => handPath(HAND_HOUR_LEN, 16), []);
  const minPath = useMemo(() => handPath(HAND_MIN_LEN, 18), []);
  const secPath = useMemo(() => handPath(HAND_SEC_LEN, HAND_SEC_TAIL), []);

  const origin = useMemo(() => ({ x: CX, y: CY }), []);
  const hourT = useDerivedValue(() => [{ rotate: hour.value * RAD }]);
  const minT = useDerivedValue(() => [{ rotate: minute.value * RAD }]);
  const secT = useDerivedValue(() => [{ rotate: second.value * RAD }]);

  return (
    <Group>
      <Group origin={origin} transform={hourT}>
        <Path
          path={hourPath}
          color={theme.ink}
          style="stroke"
          strokeWidth={HAND_HOUR_W}
          strokeCap="round"
        />
      </Group>
      <Group origin={origin} transform={minT}>
        <Path
          path={minPath}
          color={theme.ink}
          style="stroke"
          strokeWidth={HAND_MIN_W}
          strokeCap="round"
        />
      </Group>
      <Group origin={origin} transform={secT}>
        <Path
          path={secPath}
          color={theme.accent}
          style="stroke"
          strokeWidth={HAND_SEC_W}
          strokeCap="round"
        />
      </Group>
      <Circle cx={CX} cy={CY} r={CAP_R} color={theme.accent} />
    </Group>
  );
}
