import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import { useCallback, type RefObject } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme, useThemeCtx, type ThemeMode } from "../theme";

const OPTIONS: { mode: ThemeMode; label: string; hint: string }[] = [
  { mode: "light", label: "Light", hint: "Always the white page" },
  { mode: "dark", label: "Dark", hint: "Always the black page" },
  { mode: "system", label: "System", hint: "Follow the device setting" },
];

type Props = {
  sheetRef: RefObject<BottomSheetModal | null>;
};

/**
 * The "…" menu. Nothing but appearance for now, so it sizes to its content
 * rather than claiming a snap point.
 */
export function AppearanceSheet({ sheetRef }: Props) {
  const theme = useTheme();
  const { mode, setMode } = useThemeCtx();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

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

  const pick = useCallback(
    (next: ThemeMode) => {
      if (!reduceMotion) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setMode(next);
      sheetRef.current?.dismiss();
    },
    [reduceMotion, setMode, sheetRef]
  );

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
        <Text style={[styles.heading, { color: theme.ink }]}>Appearance</Text>

        {OPTIONS.map((o, i) => (
          <Pressable
            key={o.mode}
            onPress={() => pick(o.mode)}
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    gap: 12,
  },
  rowText: { flexShrink: 1, gap: 2 },
  label: { fontSize: 16, fontWeight: "500" },
  hint: { fontSize: 13 },
});
