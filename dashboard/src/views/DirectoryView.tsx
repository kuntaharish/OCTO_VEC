import { useState, useMemo, useRef, useCallback } from "react";
import { Maximize2, Lock, X, Search, ChevronLeft } from "lucide-react";
import { usePolling, postApi } from "../hooks/useApi";
import { useAgentStream } from "../hooks/useSSE";
import type { Employee, Task, AgentProfile } from "../types";

const ROLE_COLORS: Record<string, string> = {
  "Project Manager": "var(--purple)", "Senior Developer": "var(--blue)",
  "Business Analyst": "var(--green)", "QA Engineer": "var(--yellow)",
  "Security Engineer": "var(--red)", "DevOps Engineer": "var(--orange)",
};

const LOCKED = new Set(["message_agent", "read_inbox"]);

const TOOL_GROUPS: { label: string; match: (t: string) => boolean }[] = [
  { label: "Messaging", match: (t) => t.includes("message") || t.includes("inbox") },
  { label: "Memory",    match: (t) => t.includes("memory") || t.includes("stm") || t.includes("ltm") || t.includes("sltm") },
  { label: "Tasks",     match: (t) => t.includes("task") || t.includes("assign") || t.includes("start") },
  { label: "Files",     match: (t) => t.includes("read") || t.includes("write") || t.includes("edit") || t.includes("file") || t.includes("find") || t.includes("grep") || t.includes("ls") },
  { label: "Shell",     match: (t) => t.includes("bash") || t.includes("shell") || t.includes("exec") },
  { label: "Directory", match: (t) => t.includes("director") || t.includes("employee") || t.includes("lookup") },
  { label: "Utils",     match: (t) => t.includes("date") || t.includes("time") || t.includes("search") },
];

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const DUR = "0.44s";
const ACTIVE_AGENTS = ["pm", "ba", "dev"];

function getInitials(name: string): string {
  const parts = name.split(" ");
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function groupTools(tools: string[]) {
  const used = new Set<string>();
  const groups: { label: string; tools: string[] }[] = [];
  for (const g of TOOL_GROUPS) {
    const m = tools.filter((t) => !used.has(t) && g.match(t));
    if (m.length) { m.forEach((t) => used.add(t)); groups.push({ label: g.label, tools: m }); }
  }
  const rest = tools.filter((t) => !used.has(t));
  if (rest.length) groups.push({ label: "Other", tools: rest });
  return groups;
}

/* ── Expanded tools grid (used inside the full-page panel) ── */

function ExpandedToolsGrid({ profile }: { profile: AgentProfile }) {
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(profile.enabled_tools));
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify([...enabled].sort()) !== JSON.stringify([...profile.enabled_tools].sort());

  function toggle(t: string) {
    if (LOCKED.has(t)) return;
    setEnabled((p) => { const n = new Set(p); n.has(t) ? n.delete(t) : n.add(t); return n; });
  }

  async function save() {
    setSaving(true);
    try { await postApi("/api/agent-config", { agent_id: profile.agent_id, tools: Array.from(enabled) }); }
    catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  const groups = groupTools(profile.all_tools);
  const count = profile.all_tools.filter((t) => enabled.has(t)).length;

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 14,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Tools</span>
          <span style={{
            fontSize: 11, color: "var(--text-muted)", background: "var(--bg-tertiary)",
            padding: "2px 8px", borderRadius: 5, fontFamily: "monospace",
          }}>
            {count}/{profile.all_tools.length}
          </span>
        </div>
        {dirty && (
          <button onClick={save} disabled={saving} style={{
            fontSize: 11, fontWeight: 500, padding: "4px 14px", borderRadius: 6, border: "none",
            background: "var(--accent)", color: "#fff", cursor: "pointer", fontFamily: "inherit",
            opacity: saving ? 0.5 : 1,
          }}>
            {saving ? "Saving..." : "Save changes"}
          </button>
        )}
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
        gap: 10,
      }}>
        {groups.map((g) => (
          <div key={g.label} style={{
            border: "1px solid var(--border)",
            borderRadius: 8, overflow: "hidden",
          }}>
            <div style={{
              fontSize: 10, fontWeight: 600, color: "var(--text-muted)",
              textTransform: "uppercase", letterSpacing: "0.05em",
              padding: "7px 12px 5px",
              background: "var(--bg-tertiary)",
              borderBottom: "1px solid var(--border)",
            }}>
              {g.label}
            </div>
            {g.tools.map((tool, i) => {
              const on = enabled.has(tool);
              const locked = LOCKED.has(tool);
              return (
                <div key={tool}
                  className={`tool-row${locked ? " locked" : ""}`}
                  onClick={() => toggle(tool)}
                  style={{
                    borderBottom: i < g.tools.length - 1 ? "1px solid var(--border)" : "none",
                    height: 32,
                  }}
                >
                  <span style={{
                    flex: 1, fontSize: 11, fontFamily: "monospace",
                    color: on ? "var(--text-primary)" : "var(--text-muted)",
                  }}>
                    {tool}
                  </span>
                  {locked ? (
                    <Lock size={9} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  ) : (
                    <div style={{
                      width: 28, height: 16, borderRadius: 8, flexShrink: 0,
                      background: on ? "var(--green)" : "var(--bg-tertiary)",
                      border: on ? "none" : "1px solid var(--border)",
                      position: "relative",
                      transition: "background 0.15s",
                      cursor: "pointer",
                    }}>
                      <div style={{
                        width: 12, height: 12, borderRadius: "50%",
                        background: on ? "#fff" : "var(--text-muted)",
                        position: "absolute", top: 2,
                        left: on ? 14 : 2,
                        transition: "left 0.15s, background 0.15s",
                      }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main DirectoryView ── */

export default function DirectoryView() {
  const { data: employees } = usePolling<Employee[]>("/api/employees", 10000);
  const { data: tasks } = usePolling<Task[]>("/api/tasks", 5000);
  const { data: companyData } = usePolling<{ agents: AgentProfile[] }>("/api/company", 15000);
  const { tokens, activeAgents: activeMap } = useAgentStream();

  const [search, setSearch] = useState("");
  const [steerInputs, setSteerInputs] = useState<Record<string, string>>({});
  const [interruptInputs, setInterruptInputs] = useState<Record<string, string>>({});
  const [steerOpen, setSteerOpen] = useState<Record<string, boolean>>({});
  const [interruptOpen, setInterruptOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, string | null>>({});

  // Expand animation state
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [expandFrom, setExpandFrom] = useState<{
    top: number; left: number; width: number; height: number;
    rootW: number; rootH: number;
  } | null>(null);
  const [animPhase, setAnimPhase] = useState<"idle" | "measure" | "entered" | "exiting">("idle");
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const allEmployees = employees ?? [];
  const allTasks = tasks ?? [];
  const profiles = companyData?.agents ?? [];
  const isOpen = animPhase === "entered";

  const filtered = useMemo(() => {
    if (!search.trim()) return allEmployees;
    const q = search.toLowerCase();
    return allEmployees.filter((e) =>
      e.name.toLowerCase().includes(q) ||
      e.role.toLowerCase().includes(q) ||
      e.agent_key.toLowerCase().includes(q)
    );
  }, [allEmployees, search]);

  /* ── Expand / Collapse ── */

  const openSettings = useCallback((agentKey: string) => {
    const card = cardRefs.current.get(agentKey);
    const root = rootRef.current;
    if (!card || !root) return;
    const cr = card.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    setExpandFrom({
      top: cr.top - rr.top,
      left: cr.left - rr.left,
      width: cr.width,
      height: cr.height,
      rootW: rr.width,
      rootH: rr.height,
    });
    setExpandedAgent(agentKey);
    setAnimPhase("measure");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimPhase("entered"));
    });
  }, []);

  const closeSettings = useCallback(() => {
    setAnimPhase("exiting");
    setTimeout(() => {
      setExpandedAgent(null);
      setExpandFrom(null);
      setAnimPhase("idle");
    }, 450);
  }, []);

  /* ── Steer / Interrupt ── */

  async function doSteer(key: string) {
    const msg = (steerInputs[key] ?? "").trim();
    if (!msg) return;
    setBusy((p) => ({ ...p, [key]: "steer" }));
    try { await postApi("/api/steer", { agent_id: key, message: msg }); setSteerInputs((p) => ({ ...p, [key]: "" })); setSteerOpen((p) => ({ ...p, [key]: false })); }
    catch (e) { console.error(e); }
    finally { setBusy((p) => ({ ...p, [key]: null })); }
  }

  async function doInterrupt(key: string) {
    const reason = (interruptInputs[key] ?? "").trim() || "Interrupted via dashboard";
    setBusy((p) => ({ ...p, [key]: "interrupt" }));
    try { await postApi("/api/interrupt", { agent_id: key, reason }); setInterruptInputs((p) => ({ ...p, [key]: "" })); setInterruptOpen((p) => ({ ...p, [key]: false })); }
    catch (e) { console.error(e); }
    finally { setBusy((p) => ({ ...p, [key]: null })); }
  }

  /* ── Expanded panel data ── */

  const expandedEmp = expandedAgent
    ? allEmployees.find((e) => e.agent_key === expandedAgent)
    : null;
  const expandedProfile = expandedAgent
    ? profiles.find((a) => a.agent_id === expandedAgent)
    : null;
  const expandedColor = expandedEmp ? (ROLE_COLORS[expandedEmp.role] ?? "var(--text-muted)") : "var(--text-muted)";
  const expandedTasks = expandedAgent ? allTasks.filter((t) => t.agent_id === expandedAgent) : [];

  return (
    <div ref={rootRef} style={{
      position: "relative",
      display: "flex", flexDirection: "column",
      height: "100%", overflow: "hidden",
    }}>
      {/* ── Header ── */}
      <div className="page-header" style={{
        display: "flex", alignItems: "flex-start",
        justifyContent: "space-between", gap: 16,
      }}>
        <div>
          <div className="page-title">Directory</div>
          <div className="page-subtitle">
            {filtered.length === allEmployees.length
              ? `${allEmployees.length} employees`
              : `${filtered.length} of ${allEmployees.length} employees`}
          </div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--bg-tertiary)",
          border: "1px solid var(--border)",
          borderRadius: 20, padding: "6px 14px",
          marginTop: 4, flexShrink: 0,
        }}>
          <Search size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            style={{
              border: "none", outline: "none", background: "transparent",
              color: "var(--text-primary)", fontSize: 12.5,
              width: 180, fontFamily: "inherit", padding: 0,
            }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 14, height: 14, border: "none", background: "var(--bg-hover)",
              color: "var(--text-muted)", cursor: "pointer", borderRadius: 3,
              padding: 0, flexShrink: 0,
            }}>
              <X size={9} />
            </button>
          )}
        </div>
      </div>

      {/* ── Employee cards ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 24px 20px" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 12,
        }}>
          {filtered.map((emp) => {
            const active = activeMap[emp.agent_key] ?? false;
            const empTasks = allTasks.filter((t) => t.agent_id === emp.agent_key);
            const inProg = empTasks.filter((t) => t.status === "in_progress").length;
            const done = empTasks.filter((t) => t.status === "completed").length;
            const todo = empTasks.filter((t) => t.status === "todo").length;
            const color = ROLE_COLORS[emp.role] ?? "var(--text-muted)";
            const profile = profiles.find((a) => a.agent_id === emp.agent_key);

            return (
              <div
                key={emp.employee_id}
                ref={(el) => { if (el) cardRefs.current.set(emp.agent_key, el); }}
                className="vec-card fade-in"
                style={{ padding: "16px 18px", transition: "border-color 0.1s" }}
              >
                {/* Header row */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 11,
                      background: color, opacity: 0.9,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 14, fontWeight: 600, color: "#fff",
                    }}>
                      {getInitials(emp.name)}
                    </div>
                    {active && (
                      <div style={{
                        position: "absolute", bottom: -1, right: -1,
                        width: 10, height: 10, borderRadius: "50%",
                        background: "var(--green)",
                        border: "2px solid var(--bg-card)",
                      }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3 }}>
                      {emp.name}
                    </div>
                    <div style={{ fontSize: 12, color, fontWeight: 500, marginTop: 1 }}>
                      {emp.role}
                    </div>
                  </div>
                  {profile && (
                    <button
                      className="card-expand-btn"
                      onClick={() => openSettings(emp.agent_key)}
                      title="Expand"
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 28, height: 28, border: "none", borderRadius: 7,
                        background: "transparent",
                        color: "var(--text-muted)",
                        cursor: "pointer", flexShrink: 0, padding: 0,
                      }}
                    >
                      <Maximize2 size={13} />
                    </button>
                  )}
                </div>

                {/* Agent ID */}
                <div style={{
                  fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace",
                  marginBottom: 12, opacity: 0.7,
                }}>
                  @{emp.agent_key}
                </div>

                {/* Task stats */}
                {empTasks.length > 0 && (
                  <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                    {inProg > 0 && (
                      <span style={{
                        fontSize: 11, fontWeight: 500, color: "var(--blue)",
                        background: "var(--blue-bg)", padding: "2px 8px", borderRadius: 5,
                      }}>
                        {inProg} active
                      </span>
                    )}
                    {todo > 0 && (
                      <span style={{
                        fontSize: 11, fontWeight: 500, color: "var(--text-muted)",
                        background: "var(--bg-tertiary)", padding: "2px 8px", borderRadius: 5,
                      }}>
                        {todo} pending
                      </span>
                    )}
                    {done > 0 && (
                      <span style={{
                        fontSize: 11, fontWeight: 500, color: "var(--green)",
                        background: "var(--green-bg)", padding: "2px 8px", borderRadius: 5,
                      }}>
                        {done} done
                      </span>
                    )}
                  </div>
                )}

                {/* Live stream preview */}
                {active && tokens[emp.agent_key] && (
                  <div style={{
                    padding: "6px 10px", background: "var(--bg-tertiary)",
                    borderRadius: 6, marginBottom: 12,
                    fontSize: 11, color: "var(--text-secondary)", fontFamily: "monospace",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    borderLeft: `2px solid ${color}`,
                  }}>
                    {tokens[emp.agent_key].slice(-80)}
                  </div>
                )}

                {/* Steer / Interrupt controls */}
                {ACTIVE_AGENTS.includes(emp.agent_key) && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => setSteerOpen((p) => ({ ...p, [emp.agent_key]: !p[emp.agent_key] }))}
                        style={{
                          flex: 1, fontSize: 11, padding: "5px 10px", borderRadius: 6,
                          border: "1px solid", fontFamily: "inherit", fontWeight: 500, cursor: "pointer",
                          borderColor: steerOpen[emp.agent_key] ? "var(--blue)" : "var(--border)",
                          background: steerOpen[emp.agent_key] ? "var(--blue-bg)" : "transparent",
                          color: steerOpen[emp.agent_key] ? "var(--blue)" : "var(--text-muted)",
                          transition: "all 0.08s",
                        }}>
                        Steer
                      </button>
                      <button onClick={() => setInterruptOpen((p) => ({ ...p, [emp.agent_key]: !p[emp.agent_key] }))}
                        style={{
                          flex: 1, fontSize: 11, padding: "5px 10px", borderRadius: 6,
                          border: "1px solid", fontFamily: "inherit", fontWeight: 500, cursor: "pointer",
                          borderColor: interruptOpen[emp.agent_key] ? "var(--red)" : "var(--border)",
                          background: interruptOpen[emp.agent_key] ? "var(--red-bg)" : "transparent",
                          color: interruptOpen[emp.agent_key] ? "var(--red)" : "var(--text-muted)",
                          transition: "all 0.08s",
                        }}>
                        Interrupt
                      </button>
                    </div>

                    {steerOpen[emp.agent_key] && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <input value={steerInputs[emp.agent_key] ?? ""}
                          onChange={(e) => setSteerInputs((p) => ({ ...p, [emp.agent_key]: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && doSteer(emp.agent_key)}
                          placeholder="Message..."
                          style={{ flex: 1, fontSize: 11, padding: "5px 10px", borderRadius: 6 }} />
                        <button onClick={() => doSteer(emp.agent_key)} disabled={busy[emp.agent_key] === "steer"}
                          style={{
                            fontSize: 11, padding: "5px 12px", borderRadius: 6, border: "none",
                            background: "var(--accent)", color: "#fff", cursor: "pointer",
                            fontFamily: "inherit", fontWeight: 500,
                            opacity: busy[emp.agent_key] === "steer" ? 0.5 : 1,
                          }}>
                          {busy[emp.agent_key] === "steer" ? "..." : "Send"}
                        </button>
                      </div>
                    )}

                    {interruptOpen[emp.agent_key] && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <input value={interruptInputs[emp.agent_key] ?? ""}
                          onChange={(e) => setInterruptInputs((p) => ({ ...p, [emp.agent_key]: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && doInterrupt(emp.agent_key)}
                          placeholder="Reason..."
                          style={{ flex: 1, fontSize: 11, padding: "5px 10px", borderRadius: 6, borderColor: "var(--red)" }} />
                        <button onClick={() => doInterrupt(emp.agent_key)} disabled={busy[emp.agent_key] === "interrupt"}
                          style={{
                            fontSize: 11, padding: "5px 12px", borderRadius: 6, border: "1px solid var(--red)",
                            background: "var(--red-bg)", color: "var(--red)", cursor: "pointer",
                            fontFamily: "inherit", fontWeight: 500,
                            opacity: busy[emp.agent_key] === "interrupt" ? 0.5 : 1,
                          }}>
                          {busy[emp.agent_key] === "interrupt" ? "..." : "Stop"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && allEmployees.length > 0 && (
          <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text-muted)", fontSize: 13 }}>
            No employees matching &ldquo;{search}&rdquo;
          </div>
        )}
      </div>

      {/* ── Backdrop (fades in behind expanded panel) ── */}
      {expandedAgent && expandFrom && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 19,
          background: "var(--bg-card)",
          opacity: isOpen ? 1 : 0,
          transition: animPhase === "measure" ? "none" : `opacity 0.3s ease`,
          pointerEvents: "none",
        }} />
      )}

      {/* ── Expanded settings panel ── */}
      {expandedAgent && expandFrom && expandedEmp && (() => {
        const eInProg = expandedTasks.filter((t) => t.status === "in_progress").length;
        const eDone = expandedTasks.filter((t) => t.status === "completed").length;
        const eTodo = expandedTasks.filter((t) => t.status === "todo").length;
        const active = activeMap[expandedAgent] ?? false;

        return (
          <div style={{
            position: "absolute", zIndex: 20,
            top: isOpen ? 0 : expandFrom.top,
            left: isOpen ? 0 : expandFrom.left,
            width: isOpen ? expandFrom.rootW : expandFrom.width,
            height: isOpen ? expandFrom.rootH : expandFrom.height,
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: isOpen ? 0 : 8,
            overflow: "hidden",
            boxShadow: isOpen ? "none" : "var(--shadow-lg)",
            transition: animPhase === "measure" ? "none"
              : `top ${DUR} ${EASE}, left ${DUR} ${EASE}, width ${DUR} ${EASE}, height ${DUR} ${EASE}, border-radius ${DUR} ${EASE}, box-shadow ${DUR} ${EASE}`,
          }}>
            {/* Content — fades in after panel expands */}
            <div style={{
              opacity: isOpen ? 1 : 0,
              transition: isOpen
                ? "opacity 0.22s ease-in 0.2s"
                : "opacity 0.1s ease-out",
              height: "100%",
              display: "flex", flexDirection: "column",
              overflow: "hidden",
            }}>
              {/* ── Panel header ── */}
              <div style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "16px 24px",
                borderBottom: "1px solid var(--border)",
                flexShrink: 0,
              }}>
                <button
                  onClick={closeSettings}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 32, height: 32, border: "none", borderRadius: 8,
                    background: "var(--bg-tertiary)", color: "var(--text-secondary)",
                    cursor: "pointer", flexShrink: 0, padding: 0,
                    transition: "background 0.08s, color 0.08s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-tertiary)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                >
                  <ChevronLeft size={16} />
                </button>

                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 11,
                    background: expandedColor, opacity: 0.9,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 600, color: "#fff",
                  }}>
                    {getInitials(expandedEmp.name)}
                  </div>
                  {active && (
                    <div style={{
                      position: "absolute", bottom: -1, right: -1,
                      width: 10, height: 10, borderRadius: "50%",
                      background: "var(--green)",
                      border: "2px solid var(--bg-card)",
                    }} />
                  )}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
                    {expandedEmp.name}
                  </div>
                  <div style={{ fontSize: 12, color: expandedColor, fontWeight: 500, marginTop: 1 }}>
                    {expandedEmp.role} · @{expandedAgent}
                  </div>
                </div>

                {/* Task badges in header */}
                {expandedTasks.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {eInProg > 0 && (
                      <span style={{
                        fontSize: 11, fontWeight: 500, color: "var(--blue)",
                        background: "var(--blue-bg)", padding: "3px 10px", borderRadius: 5,
                      }}>
                        {eInProg} active
                      </span>
                    )}
                    {eTodo > 0 && (
                      <span style={{
                        fontSize: 11, fontWeight: 500, color: "var(--text-muted)",
                        background: "var(--bg-tertiary)", padding: "3px 10px", borderRadius: 5,
                      }}>
                        {eTodo} pending
                      </span>
                    )}
                    {eDone > 0 && (
                      <span style={{
                        fontSize: 11, fontWeight: 500, color: "var(--green)",
                        background: "var(--green-bg)", padding: "3px 10px", borderRadius: 5,
                      }}>
                        {eDone} done
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* ── Panel body (scrollable) ── */}
              <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 28px" }}>

                {/* Tools grid */}
                {expandedProfile && (
                  <ExpandedToolsGrid key={expandedAgent} profile={expandedProfile} />
                )}

                {/* Controls section */}
                {ACTIVE_AGENTS.includes(expandedAgent) && (
                  <div style={{ marginTop: 24 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
                      marginBottom: 12,
                    }}>
                      Controls
                    </div>
                    <div style={{ display: "flex", gap: 8, maxWidth: 500 }}>
                      <button
                        onClick={() => setSteerOpen((p) => ({ ...p, [expandedAgent]: !p[expandedAgent] }))}
                        style={{
                          flex: 1, fontSize: 12, padding: "8px 14px", borderRadius: 8,
                          border: "1px solid", fontFamily: "inherit", fontWeight: 500, cursor: "pointer",
                          borderColor: steerOpen[expandedAgent] ? "var(--blue)" : "var(--border)",
                          background: steerOpen[expandedAgent] ? "var(--blue-bg)" : "transparent",
                          color: steerOpen[expandedAgent] ? "var(--blue)" : "var(--text-muted)",
                          transition: "all 0.08s",
                        }}
                      >
                        Steer
                      </button>
                      <button
                        onClick={() => setInterruptOpen((p) => ({ ...p, [expandedAgent]: !p[expandedAgent] }))}
                        style={{
                          flex: 1, fontSize: 12, padding: "8px 14px", borderRadius: 8,
                          border: "1px solid", fontFamily: "inherit", fontWeight: 500, cursor: "pointer",
                          borderColor: interruptOpen[expandedAgent] ? "var(--red)" : "var(--border)",
                          background: interruptOpen[expandedAgent] ? "var(--red-bg)" : "transparent",
                          color: interruptOpen[expandedAgent] ? "var(--red)" : "var(--text-muted)",
                          transition: "all 0.08s",
                        }}
                      >
                        Interrupt
                      </button>
                    </div>

                    {steerOpen[expandedAgent] && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8, maxWidth: 500 }}>
                        <input
                          value={steerInputs[expandedAgent] ?? ""}
                          onChange={(e) => setSteerInputs((p) => ({ ...p, [expandedAgent]: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && doSteer(expandedAgent)}
                          placeholder="Message..."
                          style={{ flex: 1, fontSize: 12, padding: "7px 12px", borderRadius: 8 }}
                        />
                        <button onClick={() => doSteer(expandedAgent)} disabled={busy[expandedAgent] === "steer"}
                          style={{
                            fontSize: 12, padding: "7px 16px", borderRadius: 8, border: "none",
                            background: "var(--accent)", color: "#fff", cursor: "pointer",
                            fontFamily: "inherit", fontWeight: 500,
                            opacity: busy[expandedAgent] === "steer" ? 0.5 : 1,
                          }}>
                          {busy[expandedAgent] === "steer" ? "..." : "Send"}
                        </button>
                      </div>
                    )}

                    {interruptOpen[expandedAgent] && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8, maxWidth: 500 }}>
                        <input
                          value={interruptInputs[expandedAgent] ?? ""}
                          onChange={(e) => setInterruptInputs((p) => ({ ...p, [expandedAgent]: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && doInterrupt(expandedAgent)}
                          placeholder="Reason..."
                          style={{ flex: 1, fontSize: 12, padding: "7px 12px", borderRadius: 8, borderColor: "var(--red)" }}
                        />
                        <button onClick={() => doInterrupt(expandedAgent)} disabled={busy[expandedAgent] === "interrupt"}
                          style={{
                            fontSize: 12, padding: "7px 16px", borderRadius: 8,
                            border: "1px solid var(--red)",
                            background: "var(--red-bg)", color: "var(--red)",
                            cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
                            opacity: busy[expandedAgent] === "interrupt" ? 0.5 : 1,
                          }}>
                          {busy[expandedAgent] === "interrupt" ? "..." : "Stop"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
