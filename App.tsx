import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { Settings } from "react-native-pulsar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { PRELOAD } from "./src/haptics";
import { NotificationSync } from "./src/notify/sync";
import { ClockdayScreen } from "./src/screens/clockday-screen";
import { PlannerProvider } from "./src/store/planner-context";
import { ThemeProvider } from "./src/theme-provider";

// Module scope, so it runs once at import: warms the native cache for the
// presets the dial fires mid-gesture, where first-fire latency would land as a
// missed beat rather than a late one.
Settings.preloadPresets(PRELOAD);

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <ThemeProvider>
            <PlannerProvider>
              {/* A sibling of the screen, not a hook inside it: this keeps
                  every notification value out of the screen's render scope,
                  where the single Pan's dependency array lives. */}
              <NotificationSync />
              {/* Innermost on purpose: @gorhom/portal lifts sheet content to
                  the *provider's* position in the tree rather than portalling
                  it, so anything mounted below this provider — the theme, the
                  planner — would be invisible to the sheet's children. */}
              <BottomSheetModalProvider>
                <ClockdayScreen />
              </BottomSheetModalProvider>
            </PlannerProvider>
          </ThemeProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
