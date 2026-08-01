import { Circle, Group, Path, Shadow, Skia, Text } from "@shopify/react-native-skia";
import { useMemo } from "react";

import {
  CX,
  CY,
  NUMERAL_R,
  R_FACE,
  TICK_LEN_MAJOR,
  TICK_LEN_MINOR,
} from "../constants";
import type { Theme } from "../theme";
import type { DialFonts } from "./fonts";

type Props = { theme: Theme; fonts: DialFonts };

/**
 * The static half of the dial: face, minute ticks and the twelve numerals.
 * Nothing here depends on a shared value, so it memoises on theme alone.
 */
export function ClockFace({ theme, fonts }: Props) {
  const ticks = useMemo(() => {
    const p = Skia.Path.Make();
    for (let i = 0; i < 60; i += 1) {
      const major = i % 5 === 0;
      const len = major ? TICK_LEN_MAJOR : TICK_LEN_MINOR;
      const rad = ((i * 6 - 90) * Math.PI) / 180;
      const outer = R_FACE - 8;
      const inner = outer - len;
      p.moveTo(CX + Math.cos(rad) * inner, CY + Math.sin(rad) * inner);
      p.lineTo(CX + Math.cos(rad) * outer, CY + Math.sin(rad) * outer);
    }
    return p;
  }, []);

  const numerals = useMemo(() => {
    const font = fonts.numeral;
    return Array.from({ length: 12 }, (_, i) => {
      const hour = i + 1;
      const label = String(hour);
      const rad = ((hour * 30 - 90) * Math.PI) / 180;
      const cx = CX + Math.cos(rad) * NUMERAL_R;
      const cy = CY + Math.sin(rad) * NUMERAL_R;
      const box = font.measureText(label);
      return {
        label,
        // measureText returns a box relative to the baseline origin, so the
        // baseline has to be nudged by half the box to visually centre it.
        x: cx - box.width / 2 - box.x,
        y: cy - (box.y + box.height / 2),
      };
    });
  }, [fonts.numeral]);

  return (
    <Group>
      <Circle cx={CX} cy={CY} r={R_FACE} color={theme.faceBg}>
        <Shadow dx={0} dy={8} blur={22} color={theme.faceShadow} />
      </Circle>
      <Circle
        cx={CX}
        cy={CY}
        r={R_FACE}
        color={theme.faceEdge}
        style="stroke"
        strokeWidth={1}
      />
      <Path
        path={ticks}
        color={theme.subtle}
        style="stroke"
        strokeWidth={1.4}
        strokeCap="round"
      />
      {numerals.map((n) => (
        <Text
          key={n.label}
          x={n.x}
          y={n.y}
          text={n.label}
          font={fonts.numeral}
          color={theme.ink}
        />
      ))}
    </Group>
  );
}
