import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { DialFonts } from "../clock/fonts";
import type { Now } from "../clock/use-now";
import { SCREEN_W } from "../constants";
import {
  usePlannerActions,
  usePlannerState,
} from "../store/planner-context";
import type { Theme } from "../theme";
import { MONTHS, parseDayKey } from "../time";
import { CalendarGrid } from "./calendar-grid";
import { ChipStrip } from "./chip-strip";
import { MiniClock } from "./mini-clock";

const YEARS = [2023, 2024, 2025, 2026, 2027, 2028, 2029];
const H_PAD = 16;

type Props = {
  onClose: () => void;
  theme: Theme;
  fonts: DialFonts;
  now: Now;
};

export function CalendarPanel({ onClose, theme, fonts, now }: Props) {
  const { selectedDay, planFor, day } = usePlannerState();
  const { selectDay } = usePlannerActions();
  const insets = useSafeAreaInsets();
  const selected = parseDayKey(selectedDay);

  const [year, setYear] = useState(selected.year);
  const [month, setMonth] = useState(selected.month);

  const monthItems = useMemo(
    () => MONTHS.map((m, i) => ({ key: String(i), label: m })),
    []
  );
  const yearItems = useMemo(
    () => YEARS.map((y) => ({ key: String(y), label: String(y) })),
    []
  );

  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(120)}
      // Anchored below the header so its chevron stays visible and tappable —
      // that is how the panel is dismissed.
      style={[
        styles.panel,
        { backgroundColor: theme.bg, top: insets.top + 50 },
      ]}
    >
      <ChipStrip
        items={monthItems}
        selectedKey={String(month)}
        onSelect={(k) => setMonth(Number(k))}
        theme={theme}
        padding={H_PAD}
      />
      <ChipStrip
        items={yearItems}
        selectedKey={String(year)}
        onSelect={(k) => setYear(Number(k))}
        theme={theme}
        padding={H_PAD}
      />

      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <CalendarGrid
          year={year}
          month={month}
          selectedKey={selectedDay}
          planFor={planFor}
          onSelect={(key) => {
            selectDay(key);
            onClose();
          }}
          theme={theme}
          width={SCREEN_W - H_PAD * 2}
        />

        <View style={styles.miniWrap}>
          <MiniClock
            ranges={day.ranges}
            theme={theme}
            fonts={fonts}
            now={now}
            scale={0.5}
          />
        </View>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: { position: "absolute", left: 0, right: 0, bottom: 0 },
  body: { paddingHorizontal: H_PAD, paddingTop: 14, alignItems: "center" },
  miniWrap: { marginTop: 4, alignItems: "center" },
});
