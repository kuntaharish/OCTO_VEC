import { useState } from "react";
import { usePolling } from "../hooks/useApi";
import type { VECEvent } from "../types";

const EVENT_COLORS: Record<string, string> = {
  task_created:     "var(--blue)",
  task_in_progress: "var(--yellow)",
  task_completed:   "var(--green)",
  task_failed:      "var(--red)",
  agent_thinking:   "var(--purple)",
  agent_tool_call:  "var(--orange)",
  message_sent:     "var(--blue)",
};

export default function EventsView() {
  const { data: events, lastRefresh } = usePolling<VECEvent[]>("/api/events", 2000);
  const [agentFilter, setAgentFilter] = useState<string>("all");

  const all = events ?? [];
  const agents = ["all", ...Array.from(new Set(all.map((e) => e.agent_id).filter(Boolean)))];
  const filtered = agentFilter === "all" ? all : all.filter((e) => e.agent_id === agentFilter);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div className="page-header" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div>
          <h1 className="page-title">Events</h1>
          <div className="page-subtitle">
            {filtered.length} events
            {lastRefresh && <span> · {lastRefresh.toLocaleTimeString()}</span>}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
          {agents.map((a) => (
            <button key={a} className={`filter-tab${agentFilter === a ? " active" : ""}`} onClick={() => setAgentFilter(a)}>
              {a === "all" ? "All" : a}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", fontSize: 13 }}>
            No events
          </div>
        ) : filtered.map((e, i) => {
          const color = EVENT_COLORS[e.event_type] ?? "var(--text-muted)";
          return (
            <div key={i} className="fade-in" style={{
              display: "flex", gap: 10, padding: "7px 24px", alignItems: "baseline",
              borderBottom: "1px solid var(--border)",
            }}>
              <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace", whiteSpace: "nowrap", minWidth: 60 }}>
                {new Date(e.timestamp).toLocaleTimeString()}
              </span>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 500, color, minWidth: 90, whiteSpace: "nowrap" }}>
                {e.event_type.replace(/_/g, " ")}
              </span>
              {e.agent_id && <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500, minWidth: 28 }}>{e.agent_id}</span>}
              <span style={{ fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                {e.message}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
