import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";

import { DARK, LIGHT, ThemeContext, type ThemeMode } from "./theme";

/**
 * `mode` defaults to "system" and follows the OS, but the "…" menu can pin it
 * so the dark treatment is reachable without changing device settings.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>("system");

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
