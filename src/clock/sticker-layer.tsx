import { StyleSheet, Text, View } from "react-native";

import { CX, CY } from "../constants";
import type { StickerItem } from "../store/types";

const SIZE = 34;

/**
 * Stickers ride above the canvas as plain views — they need no Skia and stay
 * crisp as emoji. Positions are polar so a sticker keeps its place on the dial.
 */
export function StickerLayer({ stickers }: { stickers: StickerItem[] }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {stickers.map((s) => {
        const rad = (s.angleDeg * Math.PI) / 180;
        return (
          <View
            key={s.id}
            style={[
              styles.sticker,
              {
                left: CX + Math.cos(rad) * s.radius - SIZE / 2,
                top: CY + Math.sin(rad) * s.radius - SIZE / 2,
              },
            ]}
          >
            <Text style={styles.glyph}>❤️</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sticker: {
    position: "absolute",
    width: SIZE,
    height: SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: { fontSize: 26 },
});
