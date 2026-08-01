import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ClockdayScreen } from "./src/screens/clockday-screen";
import { PlannerProvider } from "./src/store/planner-context";
import { ThemeProvider } from "./src/theme-provider";

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <ThemeProvider>
            <PlannerProvider>
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
