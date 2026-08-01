import { Canvas, Group } from "@shopify/react-native-skia";
import { View } from "react-native";

import { ClockFace } from "../clock/clock-face";
import { ClockHands } from "../clock/clock-hands";
import { RangeArcs } from "../clock/range-arcs";
import type { DialFonts } from "../clock/fonts";
import type { Now } from "../clock/use-now";
import { CANVAS } from "../constants";
import type { RangeItem } from "../store/types";
import type { Theme } from "../theme";

/**
 * The selected day, shrunk, under the calendar grid. Same layers as the main
 * dial minus the tracks and the draft — it is a preview, not a target.
 */
export function MiniClock({
  ranges,
  theme,
  fonts,
  now,
  scale,
}: {
  ranges: RangeItem[];
  theme: Theme;
  fonts: DialFonts;
  now: Now;
  scale: number;
}) {
  return (
    <View
      style={{
        width: CANVAS * scale,
        height: CANVAS * scale,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View style={{ transform: [{ scale }] }}>
        <Canvas style={{ width: CANVAS, height: CANVAS }}>
          <Group>
            <RangeArcs
              ranges={ranges}
              selectedId={null}
              theme={theme}
              fonts={fonts}
            />
            <ClockFace theme={theme} fonts={fonts} />
            <ClockHands theme={theme} now={now} />
          </Group>
        </Canvas>
      </View>
    </View>
  );
}
