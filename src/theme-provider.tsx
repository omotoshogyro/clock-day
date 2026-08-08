import Storage from "expo-sqlite/kv-store";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";

import { DARK, LIGHT, ThemeContext, type ThemeMode } from "./theme";

/** Its own key, not the plan blob: this provider sits above the planner. */
const KEY = "clockday.theme";

function readMode(): ThemeMode {
  try {
    const raw = Storage.getItemSync(KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // Fall through to the default; a theme is never worth failing a launch for.
  }
  return "system";
}

/**
 * `mode` defaults to "system" and follows the OS, but the "…" menu can pin it
 * so the dark treatment is reachable without changing device settings.
 *
 * Persisted for the same reason the plan is: now that ranges survive a
 * relaunch, a theme that silently reset would read as a bug rather than as a
 * missing feature.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>(readMode);

  useEffect(() => {
    try {
      Storage.setItem(KEY, mode);
    } catch {
      // Nothing to recover; the next launch just falls back to "system".
    }
  }, [mode]);

  const resolved = mode === "system" ? (system ?? "light") : mode;
  const theme = resolved === "dark" ? DARK : LIGHT;

  const toggle = useCallback(() => {
    setMode(resolved === "dark" ? "light" : "dark");
  }, [resolved]);

  const value = useMemo(
    () => ({ theme, mode, setMode, toggle }),
    [theme, mode, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
