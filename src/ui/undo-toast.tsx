import { useEffect } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import Animated, { SlideInDown, SlideOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { hUndo } from "../haptics";
import type { Theme } from "../theme";

/** How long the offer stands before the delete becomes final. */
const DWELL_MS = 4000;

type Props = {
  /** The deleted range's title; empty is legal, hence the fallback below. */
  title: string;
  onUndo: () => void;
  onExpire: () => void;
  theme: Theme;
};

/**
 * The only way back from the one irreversible action. It is deliberately
 * transient — the store keeps a single tombstone, and this is what can reach it,
 * so the two expire together.
 */
export function UndoToast({ title, onUndo, onExpire, theme }: Props) {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const t = setTimeout(onExpire, DWELL_MS);
    return () => clearTimeout(t);
  }, [onExpire]);

  return (
    <Animated.View
      entering={SlideInDown.duration(260)}
      exiting={SlideOutDown.duration(160)}
      style={[
        styles.wrap,
        { backgroundColor: theme.ink, bottom: insets.bottom + 10 },
      ]}
    >
      <Text style={[styles.label, { color: theme.bg }]} numberOfLines={1}>
        {title ? `Deleted “${title}”` : "Deleted block"}
      </Text>
      <Pressable
        onPress={() => {
          hUndo();
          onUndo();
        }}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Undo delete"
      >
        <Text style={[styles.action, { color: theme.accent }]}>Undo</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Absolute, so mounting it cannot resize the flex:1 stage above and jog the
  // whole dial for the four seconds it is up. `bottom` comes from the safe
  // area at runtime.
  wrap: {
    position: "absolute",
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 22,
    // It now floats over the marker tray, so it needs to sit in front of it
    // rather than look punched into the same surface.
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  label: { flexShrink: 1, fontSize: 14 },
  action: { fontSize: 14, fontWeight: "600" },
});
