// OCTO VEC dark theme — matches dashboard CSS variables
export const colors = {
  bgPrimary: "#0a0e17",
  bgSecondary: "#0f1420",
  bgCard: "#131825",
  bgTertiary: "#1a1f2e",
  bgHover: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.06)",
  accent: "#6c5ce7",
  accentDark: "#5a4bd1",
  textPrimary: "#e8eaed",
  textSecondary: "#9ca3af",
  textMuted: "#6b7280",
  green: "#4ac083",
  red: "#ef4444",
  yellow: "#e2b93d",
  blue: "#3b82f6",
  purple: "#8b5cf6",
  orange: "#f97316",
  cyan: "#06b6d4",
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
