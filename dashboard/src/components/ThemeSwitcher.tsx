import { Moon, Sun, Sparkles, Check } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import type { Theme } from "../types";

const THEMES: { id: Theme; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: "dark",     label: "Dark",     icon: <Moon size={15} />,     desc: "Notion dark" },
  { id: "light",    label: "Light",    icon: <Sun size={15} />,      desc: "Notion light" },
  { id: "midnight", label: "Midnight", icon: <Sparkles size={15} />, desc: "Deep indigo" },
];

export default function ThemeSwitcher({ onClose }: { onClose: () => void }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      style={{
        position: "fixed",
        bottom: 64,
        left: 12,
        width: 210,
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        boxShadow: "var(--shadow-lg)",
        zIndex: 1000,
        overflow: "hidden",
      }}
    >
      <div style={{
        padding: "10px 14px 7px",
        fontSize: 10.5,
        fontWeight: 700,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.07em",
      }}>
        Theme
      </div>

      {THEMES.map((t) => (
        <button
          key={t.id}
          className={`theme-option${theme === t.id ? " theme-active" : ""}`}
          onClick={() => { setTheme(t.id); onClose(); }}
        >
          {/* Theme icon */}
          <span style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 7,
            background: theme === t.id ? "var(--accent-subtle)" : "var(--bg-hover)",
            color: theme === t.id ? "var(--accent-light)" : "var(--text-muted)",
            flexShrink: 0,
          }}>
            {t.icon}
          </span>

          {/* Labels */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: theme === t.id ? 600 : 400 }}>{t.label}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{t.desc}</div>
          </div>

          {/* Active checkmark */}
          {theme === t.id && (
            <span style={{ color: "var(--accent-light)", display: "flex" }}>
              <Check size={14} />
            </span>
          )}
        </button>
      ))}

      <div style={{ height: 6 }} />
    </div>
  );
}
