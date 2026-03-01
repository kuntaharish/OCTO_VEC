import { usePolling } from "../hooks/useApi";
import { useAgentStream } from "../hooks/useSSE";
import type { Task, VECEvent, Employee } from "../types";

export default function OverviewView() {
  const { data: tasks, lastRefresh } = usePolling<Task[]>("/api/tasks", 3000);
  const { data: events } = usePolling<VECEvent[]>("/api/events", 3000);
  const { data: employees } = usePolling<Employee[]>("/api/employees", 10000);
  const { tokens, connected, activeAgents: activeMap } = useAgentStream();

  const allTasks = tasks ?? [];
  const allEvents = events ?? [];
  const allEmployees = employees ?? [];

  const stats = [
    { label: "Total",       value: allTasks.length, color: "var(--text-primary)" },
    { label: "In Progress", value: allTasks.filter((t) => t.status === "in_progress").length, color: "var(--blue)" },
    { label: "Completed",   value: allTasks.filter((t) => t.status === "completed").length, color: "var(--green)" },
    { label: "Failed",      value: allTasks.filter((t) => t.status === "failed").length, color: "var(--red)" },
  ];

  const activeAgents = Object.keys(activeMap).filter((k) => activeMap[k]);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
      {/* Header */}
      <div className="page-header" style={{ padding: "0 0 16px" }}>
        <h1 className="page-title">Overview</h1>
        <div className="page-subtitle">
          {connected ? "Live" : "Polling"}
          {lastRefresh && <span> · {lastRefresh.toLocaleTimeString()}</span>}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {stats.map((s) => (
          <div key={s.label} style={{
            flex: 1, padding: "14px 16px",
            background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8,
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Live activity */}
      {activeAgents.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Live
          </div>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            {activeAgents.map((id, i) => (
              <div key={id} style={{
                padding: "10px 14px",
                borderBottom: i < activeAgents.length - 1 ? "1px solid var(--border)" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>{id}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {tokens[id].slice(-120)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Team
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {allEmployees.map((emp) => {
            const isActive = activeMap[emp.agent_key] ?? false;
            return (
              <div key={emp.employee_id} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 10px", borderRadius: 6,
                background: "var(--bg-card)", border: "1px solid var(--border)",
                fontSize: 12,
              }}>
                <span style={{ fontWeight: 500, color: isActive ? "var(--text-primary)" : "var(--text-muted)" }}>{emp.name.split(" ")[0]}</span>
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{emp.role}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent events */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Recent Events
        </div>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          {allEvents.length === 0 ? (
            <div style={{ padding: 14, fontSize: 12, color: "var(--text-muted)" }}>No events yet</div>
          ) : (
            allEvents.slice(0, 8).map((e, i) => (
              <div key={i} style={{
                display: "flex", gap: 10, padding: "8px 14px", alignItems: "baseline",
                borderBottom: i < Math.min(7, allEvents.length - 1) ? "1px solid var(--border)" : "none",
              }}>
                <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace", whiteSpace: "nowrap", minWidth: 60 }}>
                  {new Date(e.timestamp).toLocaleTimeString()}
                </span>
                <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)", minWidth: 28 }}>{e.agent_id}</span>
                <span style={{ fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  {e.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
