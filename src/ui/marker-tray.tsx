import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  withSpring,
} from "react-native-reanimated";

import { MARKERS, SNAPPY, type MarkerId } from "../constants";
import { useTheme } from "../theme";
import { MarkerPen } from "./marker-pen";

type Props = {
  selected: MarkerId;
  onSelect: (id: MarkerId) => void;
  stickerArmed: boolean;
  onToggleSticker: () => void;
};

export function MarkerTray({
  selected,
  onSelect,
  stickerArmed,
  onToggleSticker,
}: Props) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const spring = reduceMotion ? { duration: 0 } : SNAPPY;

  const heartStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: withSpring(stickerArmed ? -12 : 0, spring) },
      { scale: withSpring(stickerArmed ? 1.15 : 1, spring) },
    ],
  }));

  return (
    <View style={[styles.tray, { borderTopColor: theme.hairline }]}>
      {MARKERS.map((m) => (
        <MarkerPen
          key={m.id}
          marker={m}
          selected={m.id === selected}
          onPress={() => onSelect(m.id)}
        />
      ))}

      <Pressable
        onPress={onToggleSticker}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ selected: stickerArmed }}
        accessibilityLabel="Heart sticker"
        style={styles.heartHit}
      >
        <Animated.View style={heartStyle}>
          <Text style={styles.heart}>❤️</Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tray: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 6,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  heartHit: { height: 80, justifyContent: "flex-end", paddingHorizontal: 8 },
  heart: { fontSize: 30 },
});
