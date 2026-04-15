import { useState, useEffect, useCallback, useRef } from "react";
import { postApi } from "../hooks/useApi";
import type { View } from "./Sidebar";

/*
 * Two-phase post-onboarding experience:
 *   Phase 1  — Welcome splash screen (what OCTO VEC can do)
 *   Phase 2  — Guided walkthrough with arrow tooltips pointing at sidebar items
 *
 * Persists completion on the server (data/.tour-done file) so it survives
 * browser clears and works across devices.
 */

// ── Tour step definition ────────────────────────────────────────────────────
interface TourStep {
  /** CSS selector or data-tour-id to anchor the tooltip */
  targetId: string;
  title: string;
  description: string;
  position: "right" | "bottom";
}

const TOUR_STEPS: TourStep[] = [
  {
    targetId: "overview",
    title: "Overview",
    description: "Your command center. See agent statuses, active tasks, recent events, and system health at a glance.",
    position: "right",
  },
  {
    targetId: "kanban",
    title: "Kanban Board",
    description: "Manage tasks visually. Drag and drop between columns. Assign work to AI agents and track progress.",
    position: "right",
  },
  {
    targetId: "live",
    title: "Live View",
    description: "Watch your AI agents work in real time. See their code output streaming live as they execute tasks.",
    position: "right",
  },
  {
    targetId: "events",
    title: "Events",
    description: "A timeline of everything happening — task completions, agent messages, errors, and system events.",
    position: "right",
  },
  {
    targetId: "snoop",
    title: "Snoop",
    description: "Peek into the internal message queue. See what agents are saying to each other behind the scenes.",
    position: "right",
  },
  {
    targetId: "directory",
    title: "Agent Directory",
    description: "Your AI team roster. Configure each agent's model, tools, and capabilities. Hire new agents or disable existing ones.",
    position: "right",
  },
  {
    targetId: "chat",
    title: "Chat",
    description: "Talk directly with any agent or create group conversations. Like Slack, but for your AI workforce.",
    position: "right",
  },
  {
    targetId: "finance",
    title: "Finance",
    description: "Track token usage and costs across all agents. See per-model pricing and department breakdowns.",
    position: "right",
  },
  {
    targetId: "settings",
    title: "Settings",
    description: "Configure channels (Telegram, Slack, Discord), integrations, security scanners, and system preferences.",
    position: "right",
  },
  {
    targetId: "settings-models",
    title: "Set Up Your AI Models",
    description: "Select a provider (OpenAI, Anthropic, Google, etc.), choose a model, and paste your API key. Click Save — your agents will start using it immediately. You can configure primary, secondary, and fallback models.",
    position: "right",
  },
];

// ── Spotlight overlay ───────────────────────────────────────────────────────
function Spotlight({ rect }: { rect: DOMRect | null }) {
  if (!rect) return null;

  const pad = 6;
  const r = 10;

  return (
    <svg style={{ position: "fixed", inset: 0, zIndex: 10000, pointerEvents: "none" }} width="100%" height="100%">
      <defs>
        <mask id="tour-mask">
          <rect width="100%" height="100%" fill="white" />
          <rect
            x={rect.left - pad} y={rect.top - pad}
            width={rect.width + pad * 2} height={rect.height + pad * 2}
            rx={r} ry={r} fill="black"
          />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#tour-mask)" />
    </svg>
  );
}

// ── Tooltip with arrow ──────────────────────────────────────────────────────
function Tooltip({ rect, step, stepIdx, total, onNext, onPrev, onSkip }: {
  rect: DOMRect | null; step: TourStep; stepIdx: number; total: number;
  onNext: () => void; onPrev: () => void; onSkip: () => void;
}) {
  const tooltipW = 320;
  const gap = 16;

  let top: number;
  let left: number;
  let arrowStyle: React.CSSProperties;

  if (!rect) {
    // Target element not found — center tooltip in viewport
    top = window.innerHeight / 2 - 80;
    left = window.innerWidth / 2 - tooltipW / 2;
    arrowStyle = {};
  } else if (step.position === "right") {
    top = rect.top + rect.height / 2 - 60;
    left = rect.right + gap;
    arrowStyle = {
      position: "absolute", left: -7, top: 24,
      width: 0, height: 0,
      borderTop: "8px solid transparent",
      borderBottom: "8px solid transparent",
      borderRight: "8px solid var(--bg-card)",
    };
  } else {
    top = rect.bottom + gap;
    left = rect.left + rect.width / 2 - tooltipW / 2;
    arrowStyle = {
      position: "absolute", top: -7, left: tooltipW / 2 - 8,
      width: 0, height: 0,
      borderLeft: "8px solid transparent",
      borderRight: "8px solid transparent",
      borderBottom: "8px solid var(--bg-card)",
    };
  }

  // Clamp to viewport
  if (top < 12) top = 12;
  if (left < 12) left = 12;
  if (left + tooltipW > window.innerWidth - 12) left = window.innerWidth - tooltipW - 12;

  return (
    <div style={{
      position: "fixed", top, left, width: tooltipW, zIndex: 10001,
      background: "var(--bg-card)", border: "1px solid var(--border)",
      borderRadius: 14, padding: "20px 22px 16px",
      boxShadow: "0 12px 48px rgba(0,0,0,0.35)",
      animation: "tour-pop 0.3s cubic-bezier(0.16,1,0.3,1)",
    }}>
      {/* Arrow */}
      <div style={arrowStyle} />

      {/* Step counter */}
      <div style={{
        fontSize: 11, fontWeight: 600, color: "var(--accent)",
        letterSpacing: "0.06em", marginBottom: 8,
      }}>
        {stepIdx + 1} OF {total}
      </div>

      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
        {step.title}
      </div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 18 }}>
        {step.description}
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button
          onClick={onSkip}
          style={{
            padding: "6px 0", border: "none", background: "transparent",
            color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit",
            fontSize: 12, fontWeight: 500,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = "var(--text-secondary)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          Skip tour
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          {stepIdx > 0 && (
            <button onClick={onPrev} style={{
              padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 500,
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--text-secondary)", cursor: "pointer", fontFamily: "inherit",
            }}>
              Back
            </button>
          )}
          <button onClick={onNext} style={{
            padding: "7px 20px", borderRadius: 8, fontSize: 12, fontWeight: 600,
            border: "none", background: "var(--accent)", color: "#fff",
            cursor: "pointer", fontFamily: "inherit",
          }}>
            {stepIdx === total - 1 ? "Finish" : "Next"}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        height: 3, borderRadius: 2, background: "var(--border)",
        marginTop: 14, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", borderRadius: 2, background: "var(--accent)",
          width: `${((stepIdx + 1) / total) * 100}%`,
          transition: "width 0.3s ease-out",
        }} />
      </div>
    </div>
  );
}

// ── Welcome splash — full-screen, shown BEFORE the dashboard ────────────────
function WelcomeSplash({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  const [show, setShow] = useState(false);
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
  }, []);

  function leave(cb: () => void) {
    setExiting(true);
    setTimeout(cb, 600);
  }

  const features = [
    {
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>,
      title: "Kanban Board",
      desc: "Drag-and-drop task management. Assign work to AI agents and track progress across columns.",
      color: "var(--accent)",
    },
    {
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>,
      title: "Live Agent View",
      desc: "Watch AI agents write code, reason through problems, and build software in real time.",
      color: "var(--green)",
    },
    {
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
      title: "Agent Chat",
      desc: "Talk to any agent directly or create team group chats. Like Slack for your AI workforce.",
      color: "var(--purple)",
    },
    {
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
      title: "Security Scanning",
      desc: "Gitleaks, Semgrep, and Trivy run automatically after every task. Catch vulnerabilities early.",
      color: "var(--red)",
    },
    {
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
      title: "Cost Tracking",
      desc: "Monitor per-agent token usage, model costs, and department budgets with real-time analytics.",
      color: "var(--orange)",
    },
    {
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
      title: "Agent Directory",
      desc: "Manage your AI team. Configure models, tools, and capabilities for each specialist agent.",
      color: "var(--blue)",
    },
    {
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
      title: "Event Timeline",
      desc: "Every task completion, agent message, error, and system event logged in a searchable timeline.",
      color: "var(--yellow)",
    },
    {
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>,
      title: "Multi-Channel",
      desc: "Connect via Telegram, Slack, Discord, or the web dashboard. Talk to agents from anywhere.",
      color: "var(--green)",
    },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000,
      background: "var(--bg-primary)",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
      opacity: show ? 1 : 0,
      transform: exiting ? "translateX(-100%)" : "translateX(0)",
      transition: exiting
        ? "transform 0.6s cubic-bezier(0.4,0,0.2,1), opacity 0.4s ease-out 0.2s"
        : "opacity 0.5s ease-out",
    }}>
      {/* Skip — top right */}
      <button
        onClick={() => leave(onSkip)}
        style={{
          position: "fixed", top: 20, right: 24, zIndex: 10001,
          padding: "7px 18px", borderRadius: 980, fontSize: 12, fontWeight: 500,
          border: "1px solid var(--border)", background: "color-mix(in srgb, var(--bg-card) 80%, transparent)",
          backdropFilter: "blur(8px)",
          color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit",
          transition: "color 0.15s, border-color 0.15s",
          opacity: 0, animation: "tour-pop 0.4s ease-out 0.5s forwards",
        }}
        onMouseEnter={e => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.borderColor = "var(--text-muted)"; }}
        onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
      >
        Skip
      </button>

      {/* Main content — left side, vertically centered */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        width: "100%", maxWidth: 920,
        padding: "0 40px 0 40px",
      }}>
        {/* Header */}
        <div style={{
          width: 48, height: 48, borderRadius: 14, marginBottom: 14,
          background: "var(--accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, fontWeight: 700, color: "#fff",
          opacity: 0, animation: "tour-pop 0.5s ease-out 0.1s forwards",
        }}>
          O
        </div>

        <h1 style={{
          fontSize: "clamp(24px, 4vw, 34px)", fontWeight: 700,
          color: "var(--text-primary)", letterSpacing: "-0.03em",
          lineHeight: 1.15, margin: 0, textAlign: "center",
          opacity: 0, animation: "tour-pop 0.5s ease-out 0.2s forwards",
        }}>
          Welcome to OCTO VEC
        </h1>
        <p style={{
          fontSize: 14, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.6,
          maxWidth: 400, textAlign: "center",
          opacity: 0, animation: "tour-pop 0.5s ease-out 0.35s forwards",
        }}>
          Your autonomous AI workforce. Here's everything you can do from this dashboard.
        </p>

        {/* Feature grid — 4x2, bigger cards */}
        <div style={{
          width: "100%",
          marginTop: 28,
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12,
        }}>
          {features.map((f, i) => (
            <div key={i} style={{
              padding: "18px 16px", borderRadius: 14,
              background: "var(--bg-card)", border: "1px solid var(--border)",
              opacity: 0, animation: `tour-pop 0.5s ease-out ${0.4 + i * 0.06}s forwards`,
              transition: "border-color 0.15s, transform 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = f.color; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: 10, marginBottom: 12,
                background: `color-mix(in srgb, ${f.color} 10%, transparent)`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {f.icon}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 5 }}>{f.title}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Chevron pill button — right edge */}
      <button
        onClick={() => leave(onStart)}
        style={{
          position: "fixed", right: 16, top: "50%", transform: "translateY(-50%)",
          width: 56, height: 56, borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.06)",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: 0, animation: "tour-pop 0.6s ease-out 1s forwards",
          transition: "background 0.2s, border-color 0.2s, transform 0.2s",
          padding: 0,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = "rgba(255,255,255,0.14)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)";
          e.currentTarget.style.transform = "translateY(-50%) scale(1.08)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = "rgba(255,255,255,0.06)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
          e.currentTarget.style.transform = "translateY(-50%) scale(1)";
        }}
      >
        <div style={{ animation: "tour-pulse 2s ease-in-out infinite", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M9 5l7 7-7 7" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      <style>{`
        @keyframes tour-pop {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes tour-pulse {
          0%, 100% { transform: translateX(0); opacity: 1; }
          50% { transform: translateX(4px); opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}

// ── Exported splash (used full-screen before dashboard) ─────────────────────
export { WelcomeSplash };
export { markTourDone };

// ── Walkthrough overlay (used on top of the dashboard) ──────────────────────
export default function WelcomeTour({ onDone, setActiveView }: { onDone: () => void; setActiveView: (v: View) => void }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const rafRef = useRef(0);

  const step = TOUR_STEPS[stepIdx];

  // Sync the active view with the current tour step
  useEffect(() => {
    if (step.targetId.startsWith("settings-")) {
      // e.g. "settings-models" → navigate to settings, then open models section
      setActiveView("settings" as View);
      const subSection = step.targetId.replace("settings-", "");
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("settings-nav", { detail: subSection }));
      }, 100);
    } else {
      setActiveView(step.targetId as View);
    }
  }, [step.targetId, setActiveView]);

  const updateRect = useCallback(() => {
    const el = document.querySelector(`[data-tour-id="${step.targetId}"]`);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
    }
    rafRef.current = requestAnimationFrame(updateRect);
  }, [step]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(updateRect);
    return () => cancelAnimationFrame(rafRef.current);
  }, [updateRect]);

  function finishTour() {
    markTourDone();
    // Leave user on the models config page so they can set up right away
    setActiveView("settings" as View);
    window.dispatchEvent(new CustomEvent("settings-nav", { detail: "models" }));
    onDone();
  }

  function goToStep(idx: number) {
    setStepIdx(idx);
  }

  return (
    <>
      <Spotlight rect={targetRect} />
      <Tooltip
        rect={targetRect}
        step={step}
        stepIdx={stepIdx}
        total={TOUR_STEPS.length}
        onNext={() => {
          if (stepIdx < TOUR_STEPS.length - 1) goToStep(stepIdx + 1);
          else finishTour();
        }}
        onPrev={() => goToStep(Math.max(0, stepIdx - 1))}
        onSkip={finishTour}
      />

      {/* Click blocker behind tooltip — pointer-events:none so underlying UI stays interactive */}
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 9999,
          cursor: "default", pointerEvents: "none",
        }}
      />

      <style>{`
        @keyframes tour-pop {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}

/** Persist tour completion on the server. */
function markTourDone() {
  postApi("/api/tour-done", {}).catch(() => { /* best effort */ });
}
