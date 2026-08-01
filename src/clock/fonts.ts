import { matchFont, type SkFont } from "@shopify/react-native-skia";
import { useMemo } from "react";

import { LABEL_SIZE, NUMERAL_SIZE } from "../constants";

export type DialFonts = {
  numeral: SkFont;
  label: SkFont;
  mini: SkFont;
};

/**
 * `matchFont` resolves a *system* typeface, so nothing has to be bundled and
 * there is no `expo-font` asset step. It is a plain function, not a hook, so
 * it is memoised here and threaded down as props.
 */
export function useDialFonts(): DialFonts {
  return useMemo(
    () => ({
      numeral: matchFont({
        fontFamily: "System",
        fontSize: NUMERAL_SIZE,
        fontWeight: "700",
      }),
      label: matchFont({
        fontFamily: "System",
        fontSize: LABEL_SIZE,
        fontWeight: "600",
      }),
      mini: matchFont({
        fontFamily: "System",
        fontSize: 11,
        fontWeight: "600",
      }),
    }),
    []
  );
}
