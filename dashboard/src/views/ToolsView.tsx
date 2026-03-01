import { Lock } from "lucide-react";
import { useState } from "react";
import { usePolling, postApi } from "../hooks/useApi";
import type { AgentProfile } from "../types";

interface CompanyData {
  agents: AgentProfile[];
}

const LOCKED = new Set(["message_agent", "read_inbox"]);

export default function ToolsView() {
  const { data, refresh } = usePolling<CompanyData>("/api/company", 10000);
  const [saving, setSaving] = useState<string | null>(null);
  const [localTools, setLocalTools] = useState<Record<string, Set<string>>>({});

  const agents = data?.agents ?? [];

  function getEnabled(agent: AgentProfile): Set<string> {
    return localTools[agent.agent_id] ?? new Set(agent.enabled_tools);
  }

  async function saveConfig(agent: AgentProfile) {
    setSaving(agent.agent_id);
    try {
      await postApi("/api/agent-config", { agent_id: agent.agent_id, tools: Array.from(getEnabled(agent)) });
      await refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(null);
    }
  }

  function toggleTool(agentId: string, tool: string) {
    setLocalTools((prev) => {
      const base = prev[agentId] ?? new Set(agents.find((a) => a.agent_id === agentId)?.enabled_tools ?? []);
      const next = new Set(base);
      next.has(tool) ? next.delete(tool) : next.add(tool);
      return { ...prev, [agentId]: next };
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Page header */}
      <div style={{ padding: "20px 28px 14px", borderBottom: "1px solid var(--border-muted)", flexShrink: 0 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
          Tool Config
        </h1>
        <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 3 }}>
          Click a row to toggle. Locked tools are always active. Changes are local until saved.
        </div>
      </div>

      {/* Agent sections */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 28px 32px" }}>
        {agents.map((agent, agentIndex) => {
          const enabled = getEnabled(agent);
          const isDirty = JSON.stringify([...enabled].sort()) !== JSON.stringify([...agent.enabled_tools].sort());
          const enabledCount = agent.all_tools.filter((t) => enabled.has(t)).length;

          return (
            <div key={agent.agent_id} style={{
              paddingTop: agentIndex === 0 ? 20 : 28,
              marginBottom: 4,
            }}>
              {/* Section header */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>
                  {agent.name}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace" }}>
                  @{agent.agent_id}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>·</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{agent.role}</span>
                <span style={{
                  fontSize: 11, color: "var(--text-muted)",
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border-muted)",
                  borderRadius: 4,
                  padding: "1px 6px",
                  fontFamily: "monospace",
                  marginLeft: 2,
                }}>
                  {enabledCount}/{agent.all_tools.length}
                </span>

                {isDirty && (
                  <button
                    onClick={() => saveConfig(agent)}
                    disabled={saving === agent.agent_id}
                    style={{
                      marginLeft: "auto",
                      padding: "4px 12px",
                      fontSize: 12, fontWeight: 600,
                      borderRadius: 5, border: "none",
                      background: "var(--accent)", color: "#fff",
                      cursor: "pointer", fontFamily: "inherit",
                      opacity: saving === agent.agent_id ? 0.6 : 1,
                      transition: "opacity 0.15s",
                    }}
                  >
                    {saving === agent.agent_id ? "Saving…" : "Save changes"}
                  </button>
                )}
              </div>

              {/* Tool list */}
              <div style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                overflow: "hidden",
                background: "var(--bg-card)",
              }}>
                {agent.all_tools.map((tool, i) => {
                  const isEnabled = enabled.has(tool);
                  const isLocked = LOCKED.has(tool);
                  const isLast = i === agent.all_tools.length - 1;

                  return (
                    <div
                      key={tool}
                      className={`tool-row${isLocked ? " locked" : ""}`}
                      onClick={() => !isLocked && toggleTool(agent.agent_id, tool)}
                      style={{
                        borderBottom: isLast ? "none" : "1px solid var(--border-muted)",
                      }}
                    >
                      {/* Status indicator */}
                      <div style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        flexShrink: 0,
                        background: isEnabled ? "var(--green)" : "transparent",
                        border: isEnabled ? "none" : "1.5px solid var(--border)",
                        transition: "background 0.12s, border-color 0.12s",
                      }} />

                      {/* Tool name */}
                      <span style={{
                        flex: 1,
                        fontSize: 12.5,
                        fontFamily: "monospace",
                        color: isEnabled ? "var(--text-primary)" : "var(--text-muted)",
                        fontWeight: isEnabled ? 500 : 400,
                        transition: "color 0.12s",
                      }}>
                        {tool}
                      </span>

                      {/* Lock icon */}
                      {isLocked && (
                        <Lock size={11} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {agents.length === 0 && (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            No agents found
          </div>
        )}
      </div>
    </div>
  );
}
