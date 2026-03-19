import { useState } from "react";
import { Bell, Clock, CheckCircle2, Trash2, Filter } from "lucide-react";
import { usePolling, deleteApi } from "../hooks/useApi";
import { useEmployees } from "../context/EmployeesContext";
import type { Reminder } from "../types";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) {
    const abs = -diff;
    if (abs < 60_000) return `in ${Math.round(abs / 1000)}s`;
    if (abs < 3_600_000) return `in ${Math.round(abs / 60_000)}m`;
    if (abs < 86_400_000) return `in ${Math.round(abs / 3_600_000)}h`;
    return `in ${Math.round(abs / 86_400_000)}d`;
  }
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function RemindersView() {
  const [showAll, setShowAll] = useState(false);
  const { data: reminders, refresh } = usePolling<Reminder[]>(
    `/api/reminders?all=${showAll}`, 5000
  );
  const { employees } = useEmployees();

  const agentName = (agentId: string) => {
    const emp = employees?.find(e => e.agent_key === agentId);
    return emp?.name?.split(" ")[0] ?? agentId;
  };

  const agentColor = (agentId: string) => {
    const emp = employees?.find(e => e.agent_key === agentId);
    return emp?.color ?? "var(--text-muted)";
  };

  async function handleDelete(id: string) {
    await deleteApi(`/api/reminders/${id}`);
    refresh();
  }

  const items = reminders ?? [];
  const pending = items.filter(r => !r.triggered_at);
  const triggered = items.filter(r => !!r.triggered_at);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div className="page-header">
        <h1 className="page-title">Reminders</h1>
        <div className="page-subtitle">
          {pending.length} pending{triggered.length > 0 ? ` · ${triggered.length} triggered` : ""}
        </div>
      </div>

      {/* Filter bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 20px", borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <Filter size={13} style={{ color: "var(--text-muted)" }} />
        <button
          onClick={() => setShowAll(!showAll)}
          style={{
            fontSize: 11, padding: "4px 10px", borderRadius: 6,
            border: "1px solid var(--border)",
            background: showAll ? "var(--accent)" : "var(--bg-tertiary)",
            color: showAll ? "#fff" : "var(--text-secondary)",
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {showAll ? "Showing all" : "Active only"}
        </button>
      </div>

      {/* Reminder list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
        {items.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: "100%", textAlign: "center", padding: "20px",
            color: "var(--text-muted)", fontSize: 13,
          }}>
            <Bell size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
            <div>No reminders yet</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>
              Agents can set reminders using the set_reminder tool
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((rem) => {
              const isTriggered = !!rem.triggered_at;
              const isPast = new Date(rem.scheduled_for).getTime() <= Date.now();
              const color = agentColor(rem.agent_id);

              return (
                <div
                  key={rem.reminder_id}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "10px 14px", borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: isTriggered ? "var(--bg-tertiary)" : "var(--bg-card)",
                    opacity: isTriggered ? 0.6 : 1,
                  }}
                >
                  {/* Status icon */}
                  <div style={{ paddingTop: 2, flexShrink: 0 }}>
                    {isTriggered ? (
                      <CheckCircle2 size={16} style={{ color: "var(--green)" }} />
                    ) : isPast ? (
                      <Bell size={16} style={{ color: "var(--orange, var(--yellow))" }} />
                    ) : (
                      <Clock size={16} style={{ color: "var(--blue)" }} />
                    )}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 500,
                      color: "var(--text-primary)",
                      marginBottom: 3,
                    }}>
                      {rem.message}
                    </div>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      fontSize: 10, color: "var(--text-muted)",
                    }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 3,
                      }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: color, flexShrink: 0,
                        }} />
                        {agentName(rem.agent_id)}
                      </span>
                      <span style={{ color: "var(--border)" }}>|</span>
                      <span>
                        {isTriggered ? "Triggered" : "Due"}: {formatDateTime(rem.scheduled_for)}
                        {" "}({timeAgo(rem.scheduled_for)})
                      </span>
                      <span style={{ color: "var(--border)" }}>|</span>
                      <span>{rem.reminder_id}</span>
                    </div>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={() => handleDelete(rem.reminder_id)}
                    title="Delete reminder"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 26, height: 26, borderRadius: 6, border: "none",
                      background: "transparent", color: "var(--text-muted)",
                      cursor: "pointer", flexShrink: 0,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--red)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
