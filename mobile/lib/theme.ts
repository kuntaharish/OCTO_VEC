// OCTO VEC — Modern monochrome dark theme
// Inspired by Linear, Vercel, and X dark modes
export const colors = {
  // Backgrounds — deep blacks with subtle warmth
  bgPrimary: "#000000",
  bgSecondary: "#0a0a0a",
  bgCard: "#111111",
  bgTertiary: "#1a1a1a",
  bgElevated: "#1e1e1e",
  bgHover: "rgba(255,255,255,0.04)",

  // Borders
  border: "rgba(255,255,255,0.08)",
  borderLight: "rgba(255,255,255,0.12)",

  // Accent — clean white instead of purple
  accent: "#ffffff",
  accentMuted: "rgba(255,255,255,0.8)",
  accentSubtle: "rgba(255,255,255,0.12)",

  // Text
  textPrimary: "#ffffff",
  textSecondary: "#a1a1a1",
  textMuted: "#666666",
  textDim: "#444444",

  // Status colors — desaturated and elegant
  green: "#3dd68c",
  red: "#f04444",
  yellow: "#eab308",
  blue: "#3b82f6",
  orange: "#f97316",
  cyan: "#22d3ee",
} as const;

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
