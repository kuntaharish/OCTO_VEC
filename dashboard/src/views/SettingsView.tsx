import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Save, RefreshCw, Server, ChevronDown, ChevronRight } from "lucide-react";
import { postApi } from "../hooks/useApi";

// ── Types ────────────────────────────────────────────────────────────────────

interface MCPServer {
  command: string;
  args: string[];
  env: Record<string, string>;
}

interface MCPConfig {
  mcpServers: Record<string, MCPServer>;
}

interface MCPStatus {
  servers: { name: string; tools: string[]; connected: boolean }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const empty: MCPServer = { command: "", args: [], env: {} };

function deepClone<T>(obj: T): T { return JSON.parse(JSON.stringify(obj)); }

// ── Component ────────────────────────────────────────────────────────────────

export default function SettingsView() {
  const [config, setConfig] = useState<MCPConfig>({ mcpServers: {} });
  const [status, setStatus] = useState<MCPStatus>({ servers: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [newName, setNewName] = useState("");

  // Fetch config + status
  const fetchAll = useCallback(async () => {
    try {
      const [cfgRes, statusRes] = await Promise.all([
        fetch("/api/mcp-config").then(r => r.json()),
        fetch("/api/mcp-status").then(r => r.json()),
      ]);
      setConfig(cfgRes);
      setStatus(statusRes);
      // Auto-expand all servers
      const exp: Record<string, boolean> = {};
      for (const k of Object.keys(cfgRes.mcpServers ?? {})) exp[k] = true;
      setExpanded(exp);
    } catch {
      showToast("Failed to load MCP config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  // ── Mutations ────────────────────────────────────────────────────────────

  function updateServer(name: string, patch: Partial<MCPServer>) {
    setConfig(prev => {
      const next = deepClone(prev);
      next.mcpServers[name] = { ...next.mcpServers[name], ...patch };
      return next;
    });
    setDirty(true);
  }

  function removeServer(name: string) {
    setConfig(prev => {
      const next = deepClone(prev);
      delete next.mcpServers[name];
      return next;
    });
    setDirty(true);
  }

  function addServer() {
    const name = newName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!name || config.mcpServers[name]) {
      showToast(name ? `"${name}" already exists` : "Enter a server name");
      return;
    }
    setConfig(prev => {
      const next = deepClone(prev);
      next.mcpServers[name] = { ...empty };
      return next;
    });
    setExpanded(prev => ({ ...prev, [name]: true }));
    setNewName("");
    setDirty(true);
  }

  function addEnvVar(name: string) {
    const key = prompt("Environment variable name:");
    if (!key?.trim()) return;
    updateServer(name, {
      env: { ...config.mcpServers[name].env, [key.trim()]: "" },
    });
  }

  function removeEnvVar(serverName: string, key: string) {
    const next = { ...config.mcpServers[serverName].env };
    delete next[key];
    updateServer(serverName, { env: next });
  }

  async function saveConfig() {
    setSaving(true);
    try {
      const res = await postApi("/api/mcp-config", config);
      if (res?.ok) {
        setDirty(false);
        showToast("Saved! Restart server to apply changes.");
        fetchAll();
      } else {
        showToast("Save failed");
      }
    } catch {
      showToast("Save failed");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const serverNames = Object.keys(config.mcpServers);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div className="page-header" style={{ padding: "24px 28px 16px" }}>
        <h1 className="page-title">Settings</h1>
        <div className="page-subtitle">
          MCP server configuration &middot; {serverNames.length} server{serverNames.length !== 1 ? "s" : ""} configured
          {status.servers.filter(s => s.connected).length > 0 && (
            <span style={{ color: "var(--green)", marginLeft: 8 }}>
              &bull; {status.servers.filter(s => s.connected).length} connected
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 28px 28px" }}>

        {/* ── MCP Section ─────────────────────────────────────────── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Server size={16} style={{ color: "var(--accent)" }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
                MCP Servers
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={fetchAll}
                title="Refresh status"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)",
                  background: "var(--bg-tertiary)", color: "var(--text-secondary)",
                  cursor: "pointer", fontSize: 12, fontFamily: "inherit",
                }}
              >
                <RefreshCw size={13} /> Refresh
              </button>
              {dirty && (
                <button
                  onClick={saveConfig}
                  disabled={saving}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 14px", borderRadius: 6, border: "none",
                    background: "var(--accent)", color: "#fff",
                    cursor: saving ? "wait" : "pointer", fontSize: 12,
                    fontWeight: 500, fontFamily: "inherit",
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  <Save size={13} /> {saving ? "Saving..." : "Save Config"}
                </button>
              )}
            </div>
          </div>

          {/* Info box */}
          <div style={{
            background: "var(--bg-tertiary)", borderRadius: 8,
            padding: "10px 14px", marginBottom: 16,
            fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6,
          }}>
            Configure MCP (Model Context Protocol) servers that agents can use. Each server provides
            tools that are automatically discovered and made available to all agents.
            Config is saved to <code style={{
              background: "var(--bg-primary)", padding: "1px 5px", borderRadius: 3,
              fontSize: 11,
            }}>data/mcp-servers.json</code>. Restart the server after changes.
          </div>

          {/* Server list */}
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>
              Loading...
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {serverNames.map(name => {
                const srv = config.mcpServers[name];
                const live = status.servers.find(s => s.name === name);
                const isOpen = expanded[name] ?? false;

                return (
                  <div key={name} style={{
                    background: "var(--bg-primary)", border: "1px solid var(--border)",
                    borderRadius: 8, overflow: "hidden",
                  }}>
                    {/* Server header */}
                    <div
                      onClick={() => setExpanded(p => ({ ...p, [name]: !p[name] }))}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "10px 14px", cursor: "pointer",
                        borderBottom: isOpen ? "1px solid var(--border)" : "none",
                      }}
                    >
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span style={{
                        fontSize: 13, fontWeight: 600, color: "var(--text-primary)", flex: 1,
                      }}>
                        {name}
                      </span>
                      {/* Status dot */}
                      <span style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: live?.connected ? "var(--green)" : "var(--text-muted)",
                        flexShrink: 0,
                      }} title={live?.connected ? "Connected" : "Disconnected"} />
                      {live?.connected && (
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {live.tools.length} tool{live.tools.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeServer(name); }}
                        title="Remove server"
                        style={{
                          display: "flex", padding: 4, border: "none", borderRadius: 4,
                          background: "transparent", color: "var(--text-muted)",
                          cursor: "pointer",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = "var(--red)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                        onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {/* Server body */}
                    {isOpen && (
                      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                        {/* Command */}
                        <Field label="Command" hint="e.g. npx, node, python">
                          <input
                            value={srv.command}
                            onChange={e => updateServer(name, { command: e.target.value })}
                            placeholder="npx"
                            style={inputStyle}
                          />
                        </Field>

                        {/* Args */}
                        <Field label="Arguments" hint="One per line">
                          <textarea
                            value={(srv.args ?? []).join("\n")}
                            onChange={e => updateServer(name, { args: e.target.value.split("\n") })}
                            placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/path/to/dir"}
                            rows={3}
                            style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }}
                          />
                        </Field>

                        {/* Env vars */}
                        <div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                            <label style={labelStyle}>Environment Variables</label>
                            <button
                              onClick={() => addEnvVar(name)}
                              style={{
                                display: "flex", alignItems: "center", gap: 4,
                                padding: "3px 8px", border: "1px solid var(--border)",
                                borderRadius: 4, background: "transparent",
                                color: "var(--text-muted)", cursor: "pointer",
                                fontSize: 11, fontFamily: "inherit",
                              }}
                            >
                              <Plus size={12} /> Add
                            </button>
                          </div>
                          {Object.keys(srv.env ?? {}).length === 0 ? (
                            <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
                              No environment variables
                            </div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {Object.entries(srv.env ?? {}).map(([k, v]) => (
                                <div key={k} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                  <span style={{
                                    fontSize: 12, fontFamily: "monospace", color: "var(--text-secondary)",
                                    minWidth: 100, flexShrink: 0,
                                  }}>
                                    {k}
                                  </span>
                                  <input
                                    value={v}
                                    onChange={e => {
                                      const env = { ...srv.env, [k]: e.target.value };
                                      updateServer(name, { env });
                                    }}
                                    placeholder="value"
                                    style={{ ...inputStyle, flex: 1 }}
                                  />
                                  <button
                                    onClick={() => removeEnvVar(name, k)}
                                    style={{
                                      display: "flex", padding: 4, border: "none",
                                      background: "transparent", color: "var(--text-muted)",
                                      cursor: "pointer", borderRadius: 4,
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.color = "var(--red)"; }}
                                    onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; }}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Connected tools list */}
                        {live?.connected && live.tools.length > 0 && (
                          <div>
                            <label style={labelStyle}>Discovered Tools</label>
                            <div style={{
                              display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4,
                            }}>
                              {live.tools.map(t => (
                                <span key={t} style={{
                                  fontSize: 11, padding: "2px 8px", borderRadius: 4,
                                  background: "var(--bg-tertiary)", color: "var(--text-secondary)",
                                  fontFamily: "monospace",
                                }}>
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add new server */}
              <div style={{
                display: "flex", gap: 8, alignItems: "center",
                padding: "10px 0",
              }}>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addServer()}
                  placeholder="New server name..."
                  style={{ ...inputStyle, flex: 1, maxWidth: 260 }}
                />
                <button
                  onClick={addServer}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 14px", borderRadius: 6, border: "none",
                    background: "var(--accent)", color: "#fff",
                    cursor: "pointer", fontSize: 12, fontWeight: 500,
                    fontFamily: "inherit",
                  }}
                >
                  <Plus size={14} /> Add Server
                </button>
              </div>

              {/* Empty state */}
              {serverNames.length === 0 && !loading && (
                <div style={{
                  textAlign: "center", padding: "40px 0",
                  color: "var(--text-muted)", fontSize: 13,
                }}>
                  No MCP servers configured. Add one above to get started.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24,
          background: "var(--bg-primary)", border: "1px solid var(--border)",
          borderRadius: 8, padding: "10px 18px",
          fontSize: 13, color: "var(--text-primary)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          zIndex: 9999,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Shared styles ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-tertiary)",
  color: "var(--text-primary)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  width: "100%",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--text-muted)",
  marginBottom: 4,
  display: "block",
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>
        {label}
        {hint && <span style={{ fontWeight: 400, marginLeft: 6, opacity: 0.7 }}>{hint}</span>}
      </label>
      {children}
    </div>
  );
}
