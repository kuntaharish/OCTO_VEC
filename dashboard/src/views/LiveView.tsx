import { useRef, useEffect, useState } from "react";
import { Monitor, Waypoints, Maximize2 } from "lucide-react";
import { useAgentStream, type ActivityEntry } from "../hooks/useSSE";
import { useEmployees } from "../context/EmployeesContext";
import type { Employee } from "../types";
import NetworkPanel from "./NetworkView";

type Mode = "live" | "network" | "immersive";

const AGENT_COLORS: Record<string, string> = {
  pm: "var(--purple)", dev: "var(--blue)", ba: "var(--green)",
  qa: "var(--yellow)", security: "var(--red)", devops: "var(--orange)",
  architect: "var(--cyan, #22d3ee)", researcher: "var(--teal, #2dd4bf)",
  techwriter: "var(--pink, #f472b6)",
};

function agentColor(key: string): string {
  return AGENT_COLORS[key] ?? "var(--text-muted)";
}

function timeStr(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/* ── Timeline item (dot + line + content) — used inside per-agent cards ── */
function TimelineItem({ entry, isLast, color }: { entry: ActivityEntry; isLast: boolean; color: string }) {
  const isToolStart = entry.type === "tool_start";
  const isToolEnd = entry.type === "tool_end";
  const isText = entry.type === "text";
  const isThinking = entry.type === "thinking";
  const isAgentEnd = entry.type === "agent_end";

  let label = "";
  let detail = "";

  if (isToolStart) {
    label = entry.toolName ?? "tool";
    if (entry.toolArgs) {
      const args = Object.entries(entry.toolArgs);
      if (args.length > 0) {
        detail = args.map(([k, v]) => {
          const s = typeof v === "string" ? v : JSON.stringify(v);
          return `${k}: ${s && s.length > 50 ? s.slice(0, 47) + "..." : s}`;
        }).join(", ");
      }
    }
  } else if (isToolEnd) {
    label = `${entry.toolName ?? "tool"} ${entry.isError ? "failed" : "done"}`;
    if (entry.toolResult) {
      detail = entry.toolResult.length > 120 ? entry.toolResult.slice(0, 117) + "..." : entry.toolResult;
    }
  } else if (isText) {
    label = "output";
    detail = entry.content.length > 200 ? entry.content.slice(0, 197) + "..." : entry.content;
  } else if (isThinking) {
    label = "thinking";
    detail = entry.content.length > 120 ? entry.content.slice(0, 117) + "..." : entry.content;
  } else if (isAgentEnd) {
    label = "finished";
  }

  const dotSize = isToolStart ? 8 : isAgentEnd ? 7 : 5;
  const dotBg = isToolEnd
    ? (entry.isError ? "var(--red)" : "var(--green)")
    : isAgentEnd ? "var(--text-muted)" : color;
  const dotBorder = isToolStart ? `2px solid ${color}` : "none";
  const dotFill = isToolStart ? "transparent" : dotBg;

  return (
    <div style={{ display: "flex", gap: 0, minHeight: 24 }}>
      {/* Rail */}
      <div style={{ width: 24, display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <div style={{
          width: dotSize, height: dotSize, borderRadius: "50%",
          background: dotFill, border: dotBorder,
          marginTop: 5, flexShrink: 0,
          boxShadow: (isToolStart || isText) ? `0 0 5px ${color}` : "none",
        }} />
        {!isLast && (
          <div style={{ width: 1, flex: 1, minHeight: 6, background: "var(--border)" }} />
        )}
      </div>
      {/* Content */}
      <div style={{ flex: 1, paddingBottom: 4, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 11, fontWeight: 500,
            color: isToolEnd && entry.isError ? "var(--red)" : "var(--text-primary)",
          }}>
            {label}
          </span>
          <span style={{ fontSize: 9, color: "var(--text-muted)", marginLeft: "auto", flexShrink: 0 }}>
            {timeStr(entry.timestamp)}
          </span>
        </div>
        {detail && (
          <div style={{
            fontSize: 10, color: "var(--text-muted)", lineHeight: 1.4,
            marginTop: 1,
            fontFamily: isText || isThinking ? "inherit" : "'Cascadia Code', 'Fira Code', monospace",
            whiteSpace: "pre-wrap", wordBreak: "break-word",
            maxHeight: 48, overflow: "hidden",
          }}>
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Per-agent card with timeline inside ── */
function AgentTimelineCard({ agentKey, name, role, items, active }: {
  agentKey: string; name: string; role: string; items: ActivityEntry[]; active: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const color = agentColor(agentKey);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [items.length]);

  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8,
      display: "flex", flexDirection: "column", overflow: "hidden",
      minHeight: 160, maxHeight: 360,
    }}>
      {/* Header */}
      <div style={{
        padding: "7px 12px", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
      }}>
        <div style={{
          width: 7, height: 7, borderRadius: "50%",
          background: active ? color : "var(--text-muted)",
          opacity: active ? 1 : 0.3,
          boxShadow: active ? `0 0 6px ${color}` : "none",
        }} />
        <span style={{ fontSize: 12, fontWeight: 600, color }}>{name}</span>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{role}</span>
        <span style={{
          marginLeft: "auto", fontSize: 9, fontWeight: 500,
          color: active ? "var(--blue)" : "var(--text-muted)",
        }}>
          {active ? "streaming" : "idle"}
        </span>
      </div>
      {/* Timeline content */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: "auto", padding: "8px 10px 6px",
        background: "var(--bg-tertiary)",
      }}>
        {items.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: 11, padding: "12px 0", textAlign: "center" }}>
            No activity yet
          </div>
        ) : (
          items.map((entry, i) => (
            <TimelineItem key={entry.id} entry={entry} isLast={i === items.length - 1} color={color} />
          ))
        )}
      </div>
    </div>
  );
}

/* ── Live Mode: per-agent cards with dot-and-line timeline inside ── */
function LiveMode({ activity, activeAgents, agents }: {
  activity: ActivityEntry[]; activeAgents: Record<string, boolean>; agents: Employee[];
}) {
  // Filter useful activity types
  const items = activity.filter((e) =>
    e.type === "text" || e.type === "tool_start" || e.type === "tool_end" ||
    e.type === "thinking" || e.type === "agent_end"
  );

  // Group activity by agent
  const byAgent = new Map<string, ActivityEntry[]>();
  for (const entry of items) {
    const list = byAgent.get(entry.agentId) ?? [];
    list.push(entry);
    byAgent.set(entry.agentId, list);
  }

  // Sort: active agents first, then agents with activity, then idle
  const sorted = [...agents].sort((a, b) => {
    const aActive = activeAgents[a.agent_key] ? 1 : 0;
    const bActive = activeAgents[b.agent_key] ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    const aHas = byAgent.has(a.agent_key) ? 1 : 0;
    const bHas = byAgent.has(b.agent_key) ? 1 : 0;
    return bHas - aHas;
  });

  return (
    <div style={{
      flex: 1, overflowY: "auto", padding: "12px 20px 60px",
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
      gap: 10, alignContent: "start",
    }}>
      {sorted.map((emp) => (
        <AgentTimelineCard
          key={emp.agent_key}
          agentKey={emp.agent_key}
          name={emp.name.split(" ")[0]}
          role={emp.role}
          items={byAgent.get(emp.agent_key) ?? []}
          active={activeAgents[emp.agent_key] ?? false}
        />
      ))}
    </div>
  );
}

/* ── Immersive Mode: stacked full-width text panels ── */
function AgentPanel({ agentKey, name, role, text, active, large }: {
  agentKey: string; name: string; role: string; text: string; active: boolean; large?: boolean;
}) {
  const ref = useRef<HTMLPreElement>(null);
  const color = agentColor(agentKey);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text]);

  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8,
      display: "flex", flexDirection: "column", overflow: "hidden",
      minHeight: large ? 300 : 180,
    }}>
      <div style={{
        padding: "8px 12px", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
      }}>
        <span style={{ fontSize: large ? 14 : 12, fontWeight: 600, color }}>{name}</span>
        <span style={{ fontSize: large ? 11 : 10, color: "var(--text-muted)" }}>{role}</span>
        <span style={{
          marginLeft: "auto", fontSize: 9, fontWeight: 500,
          color: active ? "var(--blue)" : "var(--text-muted)",
        }}>
          {active ? "streaming" : "idle"}
        </span>
      </div>
      <pre
        ref={ref}
        style={{
          flex: 1, padding: large ? "14px 16px" : "10px 12px", margin: 0,
          fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
          fontSize: large ? 12.5 : 11, lineHeight: 1.6,
          color: active ? "var(--text-secondary)" : "var(--text-muted)",
          background: "var(--bg-tertiary)",
          overflowY: "auto", overflowX: "hidden",
          whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}
      >
        {text || "Waiting for output..."}
      </pre>
    </div>
  );
}

function ImmersiveMode({ agents, tokens, activeAgents }: { agents: Employee[]; tokens: Record<string, string>; activeAgents: Record<string, boolean> }) {
  const running = agents.filter((e) => activeAgents[e.agent_key]);
  const idle = agents.filter((e) => !activeAgents[e.agent_key]);
  const sorted = [...running, ...idle];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "12px 24px 60px", display: "flex", flexDirection: "column", gap: 10 }}>
      {sorted.map((emp) => (
        <AgentPanel
          key={emp.agent_key}
          agentKey={emp.agent_key}
          name={emp.name}
          role={emp.role}
          text={tokens[emp.agent_key] ?? ""}
          active={activeAgents[emp.agent_key] ?? false}
          large
        />
      ))}
    </div>
  );
}

/* ── Tab Bar ── */
const TABS: { id: Mode; label: string; icon: React.ReactNode }[] = [
  { id: "live",      label: "Live",      icon: <Monitor size={14} /> },
  { id: "network",   label: "Network",   icon: <Waypoints size={14} /> },
  { id: "immersive", label: "Immersive", icon: <Maximize2 size={14} /> },
];

function ModeBar({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div style={{
      position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
      display: "flex", gap: 2,
      background: "var(--bg-secondary)", border: "1px solid var(--border)",
      borderRadius: 10, padding: 3,
      zIndex: 10,
      boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
    }}>
      {TABS.map((tab) => {
        const active = mode === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setMode(tab.id)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 12px", borderRadius: 8, border: "none",
              background: active ? "var(--bg-hover)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-muted)",
              fontSize: 11, fontWeight: active ? 500 : 400,
              cursor: "pointer", fontFamily: "inherit",
              transition: "background 0.08s, color 0.08s",
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Main LiveView ── */
export default function LiveView() {
  const [mode, setMode] = useState<Mode>("live");
  const { tokens, activity, connected, activeAgents } = useAgentStream();
  const { employees } = useEmployees();
  const emps = employees ?? [];

  const activeCount = Object.keys(activeAgents).filter((k) => activeAgents[k]).length;
  const agents = emps.length > 0
    ? emps
    : Object.keys(tokens).map((k) => ({ employee_id: k, name: k, role: "", agent_key: k, status: "available" }));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", position: "relative" }}>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Live</h1>
        <div className="page-subtitle">
          {connected ? "Connected" : "Disconnected"} · {activeCount} active
        </div>
      </div>

      {/* Content */}
      {mode === "live" && <LiveMode activity={activity} activeAgents={activeAgents} agents={agents} />}
      {mode === "network" && <NetworkPanel />}
      {mode === "immersive" && <ImmersiveMode agents={agents} tokens={tokens} activeAgents={activeAgents} />}

      {/* Floating bottom tab bar */}
      <ModeBar mode={mode} setMode={setMode} />
    </div>
  );
}
