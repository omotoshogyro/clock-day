import { ArrowDown01Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

import { useTheme } from "../theme";
import { formatDayHeader } from "../time";
import { AnimatedText } from "./animated-text";

type Props = {
  dayKey: string;
  expanded: boolean;
  onToggleCalendar: () => void;
  onMore: () => void;
  /** "5am – 7am" while a range is being drawn or named. */
  readout: SharedValue<string>;
  /** 0 = show the date, 1 = show the readout. */
  readoutOn: SharedValue<number>;
};

export function DayHeader({
  dayKey,
  expanded,
  onToggleCalendar,
  onMore,
  readout,
  readoutOn,
}: Props) {
  const theme = useTheme();

  const dateStyle = useAnimatedStyle(() => ({
    opacity: 1 - readoutOn.value,
  }));
  const readoutStyle = useAnimatedStyle(() => ({
    opacity: readoutOn.value,
  }));

  return (
    <View style={styles.row}>
      <Animated.View style={[styles.side, dateStyle]}>
        <Pressable
          onPress={onToggleCalendar}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`${formatDayHeader(dayKey)}, ${
            expanded ? "collapse" : "expand"
          } calendar`}
          style={styles.dateBtn}
        >
          <Text style={[styles.date, { color: theme.ink }]}>
            {formatDayHeader(dayKey)}
          </Text>
          <View style={expanded ? styles.flip : undefined}>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              size={20}
              color={theme.ink}
              strokeWidth={2.2}
            />
          </View>
        </Pressable>
      </Animated.View>

      <Animated.View
        style={[StyleSheet.absoluteFill, styles.center, readoutStyle]}
        pointerEvents="none"
      >
        <AnimatedText
          value={readout}
          style={[styles.readout, { color: theme.ink }]}
        />
      </Animated.View>

      <Animated.View style={dateStyle}>
        <Pressable
          onPress={onMore}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="More options"
        >
          <HugeiconsIcon
            icon={MoreHorizontalIcon}
            size={24}
            color={theme.subtle}
            strokeWidth={2.4}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    height: 44,
  },
  side: { flexShrink: 1 },
  dateBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  date: { fontSize: 19, fontWeight: "600", letterSpacing: -0.3 },
  flip: { transform: [{ rotate: "180deg" }] },
  center: { alignItems: "center", justifyContent: "center" },
  readout: {
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center",
    padding: 0,
    minWidth: 200,
  },
});
