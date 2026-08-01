import { useCallback, useEffect, useRef } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";

import type { Theme } from "../theme";

type Props = {
  items: { key: string; label: string }[];
  selectedKey: string;
  onSelect: (key: string) => void;
  theme: Theme;
  padding: number;
};

/**
 * Horizontal pill strip that keeps the selected chip centred. Chip widths vary
 * ("Jan" vs "2023"), so positions come from onLayout rather than arithmetic.
 */
export function ChipStrip({
  items,
  selectedKey,
  onSelect,
  theme,
  padding,
}: Props) {
  const scroller = useRef<ScrollView>(null);
  const layouts = useRef<Record<string, { x: number; w: number }>>({});
  const viewportW = useRef(0);

  const centre = useCallback((key: string) => {
    const l = layouts.current[key];
    if (!l || !viewportW.current) return;
    scroller.current?.scrollTo({
      x: Math.max(0, l.x + l.w / 2 - viewportW.current / 2),
      animated: true,
    });
  }, []);

  useEffect(() => {
    // One frame's grace so the chips have reported their layout.
    const t = setTimeout(() => centre(selectedKey), 0);
    return () => clearTimeout(t);
  }, [selectedKey, centre]);

  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      onLayout={(e: LayoutChangeEvent) => {
        viewportW.current = e.nativeEvent.layout.width;
        centre(selectedKey);
      }}
      contentContainerStyle={[styles.row, { paddingHorizontal: padding }]}
    >
      {items.map((item) => {
        const on = item.key === selectedKey;
        return (
          <View
            key={item.key}
            onLayout={(e) => {
              layouts.current[item.key] = {
                x: e.nativeEvent.layout.x,
                w: e.nativeEvent.layout.width,
              };
            }}
          >
            <Pressable
              onPress={() => onSelect(item.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[
                styles.chip,
                {
                  backgroundColor: on ? theme.chipOn : "transparent",
                  borderColor: on ? theme.chipOn : theme.surfaceEdge,
                },
              ]}
            >
              <Text
                style={[
                  styles.text,
                  { color: on ? theme.chipOnInk : theme.ink },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 6 },
  chip: {
    paddingHorizontal: 18,
    height: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { fontSize: 15, fontWeight: "600" },
});
