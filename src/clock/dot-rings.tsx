import { Group, Path, Skia } from "@shopify/react-native-skia";
import { useMemo } from "react";
import { useDerivedValue } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";

import { CX, CY, DOTS_PER_RING, DOT_R, R_AM, R_PM } from "../constants";
import type { Theme } from "../theme";

/**
 * The two selection tracks: inner = AM, outer = PM. Each is a path of dots
 * rather than 96 <Circle> nodes, so the whole ring is one draw call.
 */
function dotsPath(radius: number) {
  const p = Skia.Path.Make();
  for (let i = 0; i < DOTS_PER_RING; i += 1) {
    const rad = ((i / DOTS_PER_RING) * 360 - 90) * (Math.PI / 180);
    p.addCircle(CX + Math.cos(rad) * radius, CY + Math.sin(rad) * radius, DOT_R);
  }
  return p;
}

type Props = {
  theme: Theme;
  /** 0 resting, 1 while a drag is live — the tracks darken and grow slightly. */
  active: SharedValue<number>;
};

export function DotRings({ theme, active }: Props) {
  const am = useMemo(() => dotsPath(R_AM), []);
  const pm = useMemo(() => dotsPath(R_PM), []);

  const opacity = useDerivedValue(() => 0.55 + active.value * 0.45);
  const origin = useMemo(() => ({ x: CX, y: CY }), []);
  const transform = useDerivedValue(() => [
    { scale: 1 + active.value * 0.012 },
  ]);

  return (
    <Group opacity={opacity} origin={origin} transform={transform}>
      <Path path={am} color={theme.dot} />
      <Path path={pm} color={theme.dot} />
    </Group>
  );
}
