import { createContext, useContext } from "react";

/**
 * Colour tokens. Everything chrome-ish is theme-dependent; marker colours are
 * NOT — a highlighter stays bright yellow whether the page is white or black.
 */
export type Theme = {
  dark: boolean;
  bg: string; // page background
  faceBg: string; // clock face fill
  faceEdge: string; // hairline around the face
  faceShadow: string; // soft drop shadow under the face
  ink: string; // numerals, hands, primary text
  subtle: string; // secondary text
  dot: string; // dotted track
  dotActive: string; // dotted track while a drag is in progress
  accent: string; // second hand + centre cap
  surface: string; // pills, bars, chips
  surfaceEdge: string;
  chipOn: string; // selected month/year chip
  chipOnInk: string;
  hairline: string;
  danger: string;
};

export const LIGHT: Theme = {
  dark: false,
  bg: "#FBFBFB",
  faceBg: "#FFFFFF",
  faceEdge: "rgba(60,60,67,0.06)",
  faceShadow: "rgba(17,18,20,0.10)",
  ink: "#111214",
  subtle: "#9A9AA0",
  dot: "#B9B9BE",
  dotActive: "#1C1C1E",
  accent: "#F1543F",
  surface: "#FFFFFF",
  surfaceEdge: "rgba(60,60,67,0.12)",
  chipOn: "#111214",
  chipOnInk: "#FFFFFF",
  hairline: "rgba(60,60,67,0.10)",
  danger: "#E5573F",
};

export const DARK: Theme = {
  dark: true,
  bg: "#000000",
  faceBg: "#141416",
  faceEdge: "rgba(255,255,255,0.06)",
  faceShadow: "rgba(0,0,0,0.6)",
  ink: "#FFFFFF",
  subtle: "#8A8A8E",
  dot: "#4A4A4E",
  dotActive: "#EDEDED",
  accent: "#F1543F",
  surface: "#1C1C1E",
  surfaceEdge: "rgba(255,255,255,0.12)",
  chipOn: "#FFFFFF",
  chipOnInk: "#111214",
  hairline: "rgba(255,255,255,0.10)",
  danger: "#FF6B54",
};

export type ThemeMode = "system" | "light" | "dark";

export type ThemeCtx = {
  theme: Theme;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
};

export const ThemeContext = createContext<ThemeCtx>({
  theme: LIGHT,
  mode: "system",
  setMode: () => {},
  toggle: () => {},
});

export const useTheme = () => useContext(ThemeContext).theme;
export const useThemeCtx = () => useContext(ThemeContext);
