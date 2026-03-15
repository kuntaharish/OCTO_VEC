import { useState, useEffect, useRef, useCallback } from "react";
import { postApi } from "../hooks/useApi";

/*
 * Apple-style onboarding — cinematic, full-screen, one idea per screen.
 * NO gradients. Solid colors. Typewriter hello. Clean and premium.
 *
 * Step 0  "Hello."                   (typewriter, blinking cursor, auto-advance)
 * Step 1  "Meet your AI workforce."  (feature showcase cards float in)
 * Step 2  Name input                 (big centered, minimal)
 * Step 3  Role picker                (pill chips + input)
 * Step 4  "Welcome, {name}."         (launch with scale-up exit)
 */

// ── Transition wrapper ──────────────────────────────────────────────────────
function Slide({ visible, children }: {
  visible: boolean; children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(visible);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
    } else {
      setShow(false);
      const t = setTimeout(() => setMounted(false), 700);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      opacity: show ? 1 : 0,
      transform: show ? "translateY(0) scale(1)" : "translateY(60px) scale(0.97)",
      transition: "opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)",
      pointerEvents: show ? "auto" : "none",
    }}>
      {children}
    </div>
  );
}

// ── Cycling typewriter — types, pauses, deletes, loops ──────────────────────
const GREETINGS = ["Hello.", "Hey there.", "Welcome.", "Bonjour.", "Howdy.", "Namaste.", "Hola.", "Let's go."];

function CyclingTypewriter() {
  const [wordIdx, setWordIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const word = GREETINGS[wordIdx];

  useEffect(() => {
    const typeSpeed = deleting ? 50 : 110;
    const pauseAfterType = 1600;
    const pauseAfterDelete = 400;

    if (!deleting && charIdx === word.length) {
      const t = setTimeout(() => setDeleting(true), pauseAfterType);
      return () => clearTimeout(t);
    }
    if (deleting && charIdx === 0) {
      const t = setTimeout(() => {
        setWordIdx(i => (i + 1) % GREETINGS.length);
        setDeleting(false);
      }, pauseAfterDelete);
      return () => clearTimeout(t);
    }

    const t = setTimeout(() => {
      setCharIdx(c => c + (deleting ? -1 : 1));
    }, typeSpeed);
    return () => clearTimeout(t);
  }, [charIdx, deleting, word]);

  return (
    <>
      {word.slice(0, charIdx)}
      <span style={{
        display: "inline-block", width: 4, height: "0.82em",
        background: "var(--text-primary)", marginLeft: 4, verticalAlign: "baseline",
        borderRadius: 1,
        animation: "ob-blink 1s step-end infinite",
      }} />
    </>
  );
}

// ── Feature card for step 1 ─────────────────────────────────────────────────
function FeatureCard({ icon, title, desc, color, delay }: {
  icon: React.ReactNode; title: string; desc: string; color: string; delay: number;
}) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 16, padding: "18px 22px",
      background: "var(--bg-card)", border: "1px solid var(--border)",
      borderRadius: 16, width: "100%", maxWidth: 340,
      opacity: show ? 1 : 0, transform: show ? "translateY(0)" : "translateY(30px)",
      transition: "all 0.8s cubic-bezier(0.16,1,0.3,1)",
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>{desc}</div>
      </div>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────
export default function OnboardingView({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [exiting, setExiting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const roleRef = useRef<HTMLInputElement>(null);

  // Auto-focus
  useEffect(() => {
    if (step === 2) setTimeout(() => nameRef.current?.focus(), 800);
    if (step === 3) setTimeout(() => roleRef.current?.focus(), 800);
  }, [step]);

  const advance = useCallback(() => setStep(s => s + 1), []);
  const back = useCallback(() => setStep(s => s - 1), []);


  async function finish() {
    setSaving(true);
    try {
      await postApi("/api/onboarding", { name: name || "User", role: role || "Founder & CEO" });
    } catch { /* proceed anyway */ }
    setSaving(false);
    setExiting(true);
    setTimeout(onComplete, 1200);
  }

  // Shared styles
  const inputStyle: React.CSSProperties = {
    width: "100%", maxWidth: 440, padding: "18px 0",
    fontSize: 28, fontWeight: 600, fontFamily: "inherit",
    background: "transparent", border: "none",
    borderBottom: "2px solid var(--border)",
    color: "var(--text-primary)", outline: "none",
    textAlign: "center", letterSpacing: "-0.02em",
    transition: "border-color 0.3s",
    caretColor: "var(--accent)",
  };

  const pillBtn = (active: boolean): React.CSSProperties => ({
    padding: "12px 40px", borderRadius: 980, fontSize: 14, fontWeight: 600,
    border: "none", color: "#fff", cursor: "pointer", fontFamily: "inherit",
    background: active ? "var(--accent)" : "var(--bg-tertiary)",
    transition: "all 0.3s",
    opacity: active ? 1 : 0.5,
  });

  const ghostBtn: React.CSSProperties = {
    padding: "12px 28px", borderRadius: 980, fontSize: 14, fontWeight: 500,
    border: "1px solid var(--border)", background: "transparent",
    color: "var(--text-secondary)", cursor: "pointer", fontFamily: "inherit",
    transition: "background 0.15s",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "var(--bg-primary)", overflow: "hidden",
      opacity: exiting ? 0 : 1,
      transform: exiting ? "scale(1.08)" : "scale(1)",
      transition: "opacity 1s cubic-bezier(0.16,1,0.3,1), transform 1s cubic-bezier(0.16,1,0.3,1)",
    }}>

      {/* ── Step 0: cycling typewriter — click anywhere to continue ────────── */}
      <Slide visible={step === 0}>
        <div
          onClick={advance}
          style={{
            cursor: "pointer", display: "flex", flexDirection: "column",
            alignItems: "center", gap: 48, width: "100%", height: "100%",
            justifyContent: "center",
          }}
        >
          <h1 style={{
            fontSize: "clamp(64px, 12vw, 140px)",
            fontWeight: 700,
            letterSpacing: "-0.04em",
            lineHeight: 1,
            margin: 0,
            color: "var(--text-primary)",
            userSelect: "none",
          }}>
            <CyclingTypewriter />
          </h1>

          {/* Subtle hint — fades in after 3s */}
          <div style={{
            fontSize: 13, fontWeight: 500, color: "var(--text-muted)",
            letterSpacing: "0.04em",
            opacity: 0, animation: "ob-hint-in 1s ease-out 3s forwards",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 20, height: 20, borderRadius: 6,
              border: "1.5px solid var(--text-muted)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, flexShrink: 0,
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </span>
            Click anywhere to continue
          </div>
        </div>
      </Slide>

      {/* ── Step 1: Feature showcase ───────────────────────────────────────── */}
      <Slide visible={step === 1}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 48, padding: "0 24px" }}>
          <div style={{ textAlign: "center", maxWidth: 500 }}>
            <h2 style={{
              fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 700,
              color: "var(--text-primary)", letterSpacing: "-0.03em",
              lineHeight: 1.15, margin: 0,
            }}>
              Meet your<br />
              <span style={{ color: "var(--accent)" }}>AI workforce.</span>
            </h2>
            <p style={{
              fontSize: 16, color: "var(--text-muted)", marginTop: 16, lineHeight: 1.7,
              maxWidth: 380, marginLeft: "auto", marginRight: "auto",
            }}>
              Autonomous agents that code, review, deploy,<br />and communicate — all managed from one place.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 340, alignItems: "center" }}>
            <FeatureCard
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="m9 12 2 2 4-4" /></svg>}
              title="Task Automation"
              desc="Assign tasks and watch AI agents break them down and execute."
              color="var(--accent)" delay={300}
            />
            <FeatureCard
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>}
              title="Live Coding"
              desc="Watch agents write, review, and refactor code in real time."
              color="var(--green)" delay={500}
            />
            <FeatureCard
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>}
              title="Security Scanning"
              desc="Automated vulnerability scanning after every task."
              color="var(--red)" delay={700}
            />
          </div>

          <button onClick={advance} style={{
            ...pillBtn(true),
            opacity: 0, animation: "ob-fade-up 0.6s ease-out 0.9s forwards",
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.04)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
          >
            Continue
          </button>
        </div>
      </Slide>

      {/* ── Step 2: Name ───────────────────────────────────────────────────── */}
      <Slide visible={step === 2}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 48, padding: "0 24px" }}>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
              STEP 1 OF 2
            </p>
            <h2 style={{
              fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 700,
              color: "var(--text-primary)", letterSpacing: "-0.03em",
              lineHeight: 1.15, margin: 0,
            }}>
              What should we<br />call you?
            </h2>
          </div>

          <div style={{ width: "100%", maxWidth: 440 }}>
            <input
              ref={nameRef}
              type="text"
              placeholder="Your name"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && name.trim()) advance(); }}
              onFocus={e => { e.currentTarget.style.borderBottomColor = "var(--accent)"; }}
              onBlur={e => { e.currentTarget.style.borderBottomColor = "var(--border)"; }}
              style={inputStyle}
            />
            <div style={{
              fontSize: 13, color: "var(--text-muted)", textAlign: "center", marginTop: 14,
            }}>
              Your agents will use this to address you.
            </div>
          </div>

          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <button onClick={back} style={ghostBtn}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >Back</button>
            <button onClick={advance} style={pillBtn(!!name.trim())}
              onMouseEnter={e => { if (name.trim()) e.currentTarget.style.transform = "scale(1.04)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
            >Continue</button>
          </div>
        </div>
      </Slide>

      {/* ── Step 3: Role ───────────────────────────────────────────────────── */}
      <Slide visible={step === 3}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40, padding: "0 24px" }}>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
              STEP 2 OF 2
            </p>
            <h2 style={{
              fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 700,
              color: "var(--text-primary)", letterSpacing: "-0.03em",
              lineHeight: 1.15, margin: 0,
            }}>
              What do you do{name ? "," : "?"}<br />
              {name && <span style={{ color: "var(--accent)" }}>{name}?</span>}
            </h2>
          </div>

          {/* Role pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", maxWidth: 480 }}>
            {["Founder & CEO", "CTO", "Engineering Lead", "Product Manager", "Developer", "Designer", "Data Scientist", "Student"].map(r => (
              <button
                key={r}
                onClick={() => setRole(r)}
                style={{
                  padding: "10px 20px", borderRadius: 980, fontSize: 14, fontWeight: 500,
                  border: `1.5px solid ${role === r ? "var(--accent)" : "var(--border)"}`,
                  background: role === r ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "transparent",
                  color: role === r ? "var(--accent)" : "var(--text-secondary)",
                  cursor: "pointer", fontFamily: "inherit",
                  transition: "all 0.25s cubic-bezier(0.16,1,0.3,1)",
                  transform: role === r ? "scale(1.05)" : "scale(1)",
                }}
                onMouseEnter={e => { if (role !== r) e.currentTarget.style.borderColor = "var(--text-muted)"; }}
                onMouseLeave={e => { if (role !== r) e.currentTarget.style.borderColor = "var(--border)"; }}
              >
                {r}
              </button>
            ))}
          </div>

          <div style={{ width: "100%", maxWidth: 380 }}>
            <input
              ref={roleRef}
              type="text"
              placeholder="Or type your own..."
              value={role}
              onChange={e => setRole(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && role.trim()) advance(); }}
              onFocus={e => { e.currentTarget.style.borderBottomColor = "var(--accent)"; }}
              onBlur={e => { e.currentTarget.style.borderBottomColor = "var(--border)"; }}
              style={{ ...inputStyle, fontSize: 20, maxWidth: 380 }}
            />
          </div>

          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <button onClick={back} style={ghostBtn}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >Back</button>
            <button onClick={advance} style={pillBtn(!!role.trim())}
              onMouseEnter={e => { if (role.trim()) e.currentTarget.style.transform = "scale(1.04)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
            >Continue</button>
          </div>
        </div>
      </Slide>

      {/* ── Step 4: Welcome / Launch ───────────────────────────────────────── */}
      <Slide visible={step === 4}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 48, padding: "0 24px" }}>
          <div style={{ textAlign: "center" }}>
            <h2 style={{
              fontSize: "clamp(36px, 7vw, 72px)", fontWeight: 700,
              letterSpacing: "-0.04em", lineHeight: 1.1, margin: 0,
              color: "var(--text-primary)",
            }}>
              Welcome,<br />
              <span style={{ color: "var(--accent)" }}>{name || "User"}.</span>
            </h2>
            <p style={{
              fontSize: 17, color: "var(--text-muted)", marginTop: 20, lineHeight: 1.7,
            }}>
              {role || "Founder & CEO"} — your AI team is ready.
            </p>
          </div>

          {/* Agent ring */}
          <div style={{ position: "relative", width: 200, height: 200 }}>
            {[
              { color: "var(--accent)", angle: 0, label: "PM" },
              { color: "var(--green)", angle: 60, label: "DEV" },
              { color: "var(--purple)", angle: 120, label: "QA" },
              { color: "var(--orange)", angle: 180, label: "SEC" },
              { color: "var(--red)", angle: 240, label: "OPS" },
              { color: "var(--blue)", angle: 300, label: "DOC" },
            ].map((dot, i) => {
              const rad = (dot.angle * Math.PI) / 180;
              const r = 80;
              const x = 100 + Math.cos(rad) * r - 20;
              const y = 100 + Math.sin(rad) * r - 20;
              return (
                <div key={i} style={{
                  position: "absolute", left: x, top: y, width: 40, height: 40,
                  borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
                  background: `color-mix(in srgb, ${dot.color} 15%, var(--bg-card))`,
                  border: `1.5px solid color-mix(in srgb, ${dot.color} 25%, transparent)`,
                  fontSize: 9, fontWeight: 700, color: dot.color, letterSpacing: "0.02em",
                  opacity: 0, animation: `ob-fade-up 0.5s ease-out ${0.2 + i * 0.1}s forwards`,
                }}>
                  {dot.label}
                </div>
              );
            })}
            {/* Center logo */}
            <div style={{
              position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
              width: 52, height: 52, borderRadius: 16,
              background: "var(--accent)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
              </svg>
            </div>
          </div>

          <button
            onClick={finish}
            disabled={saving}
            style={{
              padding: "16px 56px", borderRadius: 980, fontSize: 16, fontWeight: 600,
              border: "none", color: "#fff", cursor: saving ? "wait" : "pointer",
              fontFamily: "inherit",
              background: "var(--accent)",
              transition: "transform 0.2s, opacity 0.2s",
              opacity: saving ? 0.6 : 1,
            }}
            onMouseEnter={e => { if (!saving) e.currentTarget.style.transform = "scale(1.06)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
          >
            {saving ? "Setting up..." : "Launch Dashboard"}
          </button>
        </div>
      </Slide>

      {/* ── Progress bar (steps 1-4 only) ──────────────────────────────────── */}
      {step > 0 && (
        <div style={{
          position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)",
          display: "flex", gap: 6,
        }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{
              width: step === i ? 28 : 6, height: 6, borderRadius: 3,
              background: i <= step ? "var(--accent)" : "var(--border)",
              opacity: i <= step ? 1 : 0.4,
              transition: "all 0.5s cubic-bezier(0.16,1,0.3,1)",
            }} />
          ))}
        </div>
      )}

      {/* ── Keyframes ──────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes ob-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes ob-hint-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 0.6; transform: translateY(0); }
        }
        @keyframes ob-fade-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
