// OCTO VEC — Theme system with light/dark support
import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import EncryptedStorage from "react-native-encrypted-storage";

// ── Color palettes ───────────────────────────────────────────────────────────

export type ThemeMode = "light" | "dark" | "midnight";

export interface ColorPalette {
  bgPrimary: string;
  bgSecondary: string;
  bgCard: string;
  bgTertiary: string;
  bgElevated: string;
  bgHover: string;
  border: string;
  borderLight: string;
  accent: string;
  accentMuted: string;
  accentSubtle: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDim: string;
  green: string;
  red: string;
  yellow: string;
  blue: string;
  orange: string;
  cyan: string;
}

const darkColors: ColorPalette = {
  bgPrimary: "#000000",
  bgSecondary: "#0a0a0a",
  bgCard: "#111111",
  bgTertiary: "#1a1a1a",
  bgElevated: "#1e1e1e",
  bgHover: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.08)",
  borderLight: "rgba(255,255,255,0.12)",
  accent: "#ffffff",
  accentMuted: "rgba(255,255,255,0.8)",
  accentSubtle: "rgba(255,255,255,0.12)",
  textPrimary: "#ffffff",
  textSecondary: "#a1a1a1",
  textMuted: "#666666",
  textDim: "#444444",
  green: "#3dd68c",
  red: "#f04444",
  yellow: "#eab308",
  blue: "#3b82f6",
  orange: "#f97316",
  cyan: "#22d3ee",
};

const lightColors: ColorPalette = {
  bgPrimary: "#ffffff",
  bgSecondary: "#f8f8f8",
  bgCard: "#ffffff",
  bgTertiary: "#f0f0f0",
  bgElevated: "#ffffff",
  bgHover: "rgba(0,0,0,0.03)",
  border: "rgba(0,0,0,0.08)",
  borderLight: "rgba(0,0,0,0.12)",
  accent: "#000000",
  accentMuted: "rgba(0,0,0,0.8)",
  accentSubtle: "rgba(0,0,0,0.08)",
  textPrimary: "#111111",
  textSecondary: "#555555",
  textMuted: "#888888",
  textDim: "#bbbbbb",
  green: "#16a34a",
  red: "#dc2626",
  yellow: "#ca8a04",
  blue: "#2563eb",
  orange: "#ea580c",
  cyan: "#0891b2",
};

const midnightColors: ColorPalette = {
  bgPrimary: "#0e1015",
  bgSecondary: "#12141a",
  bgCard: "#14161c",
  bgTertiary: "#191c24",
  bgElevated: "#1e2130",
  bgHover: "rgba(255,255,255,0.03)",
  border: "rgba(255,255,255,0.05)",
  borderLight: "rgba(255,255,255,0.08)",
  accent: "#7b8ef8",
  accentMuted: "rgba(123,142,248,0.8)",
  accentSubtle: "rgba(123,142,248,0.08)",
  textPrimary: "rgba(255,255,255,0.88)",
  textSecondary: "rgba(255,255,255,0.55)",
  textMuted: "rgba(255,255,255,0.28)",
  textDim: "rgba(255,255,255,0.15)",
  green: "#4ec991",
  red: "#f06b6b",
  yellow: "#e0a840",
  blue: "#7b8ef8",
  orange: "#e08f55",
  cyan: "#22d3ee",
};

export const themes: Record<ThemeMode, ColorPalette> = { light: lightColors, dark: darkColors, midnight: midnightColors };

// ── Static fallback (used during initial load before context is ready) ────────
export const colors = darkColors;

export const fonts = {
  regular: "System",
  mono: "monospace",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

// ── Theme Context ────────────────────────────────────────────────────────────

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ColorPalette;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "dark",
  colors: darkColors,
  setMode: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

const STORAGE_KEY = "app_theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");

  useEffect(() => {
    EncryptedStorage.getItem(STORAGE_KEY).then(v => {
      if (v === "light" || v === "dark" || v === "midnight") setModeState(v as ThemeMode);
    }).catch(() => {});
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    EncryptedStorage.setItem(STORAGE_KEY, m).catch(() => {});
  };

  const value = useMemo(() => ({
    mode,
    colors: themes[mode],
    setMode,
  }), [mode]);

  return React.createElement(ThemeContext.Provider, { value }, children);
}
