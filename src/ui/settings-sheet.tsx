import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useState, type RefObject } from "react";
import {
  Linking,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { hPick } from "../haptics";
import {
  usePlannerActions,
  usePlannerState,
} from "../store/planner-context";
import { notifyOn } from "../store/types";
import { useTheme, useThemeCtx, type ThemeMode } from "../theme";
import { formatDayHeader } from "../time";
import { ChipStrip } from "./chip-strip";

const OPTIONS: { mode: ThemeMode; label: string; hint: string }[] = [
  { mode: "light", label: "Light", hint: "Always the white page" },
  { mode: "dark", label: "Dark", hint: "Always the black page" },
  { mode: "system", label: "System", hint: "Follow the device setting" },
];

const LEADS = [
  { key: "0", label: "At start" },
  { key: "5", label: "5m" },
  { key: "10", label: "10m" },
  { key: "15", label: "15m" },
  { key: "30", label: "30m" },
];

type Props = {
  sheetRef: RefObject<BottomSheetModal | null>;
};

/**
 * The "…" menu: reminders for the day you are looking at, then appearance.
 *
 * Reminders come first because they are scoped to the current day, where
 * appearance is a global preference — the thing tied to what is on screen
 * belongs nearest the top.
 *
 * This reads planner state through the hooks *itself*. Do not hoist these
 * values into ClockdayScreen and pass them down: a child subscribing to a
 * context does not re-render its parent, but a prop does, and the screen's
 * render scope is where the single Pan's dependency array lives.
 */
export function SettingsSheet({ sheetRef }: Props) {
  const theme = useTheme();
  const { mode, setMode } = useThemeCtx();
  const insets = useSafeAreaInsets();
  const { selectedDay, day, leadMin } = usePlannerState();
  const { setNotify, setLeadMin } = usePlannerActions();

  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    let alive = true;
    Notifications.getPermissionsAsync().then((p) => {
      if (alive) setBlocked(!p.granted && !p.canAskAgain);
    });
    return () => {
      alive = false;
    };
  }, []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.25}
        pressBehavior="close"
      />
    ),
    []
  );

  // Appearance dismisses because it is a one-shot choice you can see the result
  // of behind the sheet. The reminder rows do not — a setting you may want to
  // touch twice should not throw you out after the first tap.
  const pickMode = useCallback(
    (next: ThemeMode) => {
      hPick();
      setMode(next);
      sheetRef.current?.dismiss();
    },
    [setMode, sheetRef]
  );

  const on = notifyOn(day);

  return (
    <BottomSheetModal
      ref={sheetRef}
      enablePanDownToClose
      enableDynamicSizing
      stackBehavior="replace"
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: theme.surface }}
      handleIndicatorStyle={{ backgroundColor: theme.subtle }}
    >
      <BottomSheetView
        style={[styles.body, { paddingBottom: insets.bottom + 16 }]}
      >
        <Text style={[styles.heading, { color: theme.ink }]}>Reminders</Text>

        {blocked ? (
          <Pressable
            onPress={() => Linking.openSettings()}
            accessibilityRole="button"
            accessibilityLabel="Open notification settings"
            style={styles.row}
          >
            <View style={styles.rowText}>
              <Text style={[styles.label, { color: theme.ink }]}>
                Notifications are off for Clockday
              </Text>
              <Text style={[styles.hint, { color: theme.subtle }]}>
                Turn them on in Settings
              </Text>
            </View>
            <Text style={[styles.link, { color: theme.accent }]}>Open</Text>
          </Pressable>
        ) : (
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={[styles.label, { color: theme.ink }]}>
                {formatDayHeader(selectedDay)}
              </Text>
              <Text style={[styles.hint, { color: theme.subtle }]}>
                {on ? "Reminders on for this day" : "Muted for this day"}
              </Text>
            </View>
            <Switch
              value={on}
              onValueChange={(next) => {
                hPick();
                setNotify(selectedDay, next);
              }}
              trackColor={{ true: theme.chipOn }}
              accessibilityLabel={`Reminders for ${formatDayHeader(selectedDay)}`}
            />
          </View>
        )}

        <View
          style={[
            styles.leadRow,
            { borderTopColor: theme.hairline, borderTopWidth: StyleSheet.hairlineWidth },
          ]}
        >
          <Text style={[styles.label, { color: theme.ink }]}>Remind me</Text>
          <ChipStrip
            items={LEADS}
            selectedKey={String(leadMin)}
            onSelect={(k) => {
              hPick();
              setLeadMin(Number(k));
            }}
            theme={theme}
            padding={0}
          />
        </View>

        <Text
          style={[styles.heading, styles.headingGap, { color: theme.ink }]}
        >
          Appearance
        </Text>

        {OPTIONS.map((o, i) => (
          <Pressable
            key={o.mode}
            onPress={() => pickMode(o.mode)}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === o.mode }}
            accessibilityLabel={o.label}
            style={[
              styles.row,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth },
              { borderTopColor: theme.hairline },
            ]}
          >
            <View style={styles.rowText}>
              <Text style={[styles.label, { color: theme.ink }]}>{o.label}</Text>
              <Text style={[styles.hint, { color: theme.subtle }]}>
                {o.hint}
              </Text>
            </View>
            {mode === o.mode && (
              <HugeiconsIcon
                icon={Tick02Icon}
                size={20}
                color={theme.ink}
                strokeWidth={2.6}
              />
            )}
          </Pressable>
        ))}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingTop: 4 },
  heading: {
    fontSize: 19,
    fontWeight: "600",
    letterSpacing: -0.3,
    paddingBottom: 8,
  },
  headingGap: { paddingTop: 18 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    gap: 12,
  },
  leadRow: { paddingTop: 14, gap: 8 },
  rowText: { flexShrink: 1, gap: 2 },
  label: { fontSize: 16, fontWeight: "500" },
  hint: { fontSize: 13 },
  link: { fontSize: 15, fontWeight: "600" },
});
