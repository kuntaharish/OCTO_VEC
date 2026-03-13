import { useState, useEffect, useCallback } from "react";
import {
  Plus, Trash2, Save, RefreshCw, Server, ChevronDown, ChevronRight,
  Shield, Search, MessageSquare, Cpu, Box, ExternalLink,
  Zap, Settings2, Database, Eye, Star, Check, X, Package,
} from "lucide-react";
import { postApi, apiUrl } from "../hooks/useApi";
import { usePolling } from "../hooks/useApi";
import Dropdown, { type DropdownOption } from "../components/Dropdown";
import MCP_DIRECTORY, { CATEGORY_META, type MCPDirectoryEntry, type MCPCategory } from "../data/mcpDirectory";

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

interface ModelSlot {
  provider: string;
  model: string;
}

interface ProviderInfo {
  id: string;
  name: string;
  configured: boolean;
  envKey: string;
  models: string[];
  iconUrl: string;
}

interface ModelConfigData {
  providers: ProviderInfo[];
  config: {
    primary: ModelSlot;
    secondary: ModelSlot | null;
    fallback: ModelSlot | null;
    agentModels: Record<string, ModelSlot>;
  };
}

interface SystemSettings {
  system: {
    companyName: string;
    workspace: string;
    dashboardPort: number;
    cliEnabled: boolean;
    debounceMs: number;
    contextWindow: number;
    compactThreshold: number;
  };
  llm: {
    provider: string;
    model: string;
    thinkingLevel: string;
    temperature: number;
    maxTokens: number;
  };
  proactive: {
    enabled: boolean;
    intervalSecs: number;
  };
  integrations: {
    telegram: { configured: boolean; chatId: string };
    searxng: { configured: boolean; url: string };
    sonarqube: { configured: boolean; hostUrl: string; projectKey: string };
    gitleaks: { configured: boolean };
    semgrep: { configured: boolean };
    trivy: { configured: boolean };
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function deepClone<T>(obj: T): T { return JSON.parse(JSON.stringify(obj)); }

// ── Section wrapper ─────────────────────────────────────────────────────────

function Section({ title, icon, children, defaultOpen = true }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 20 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          padding: "10px 0", border: "none", background: "transparent",
          cursor: "pointer", fontFamily: "inherit",
        }}
      >
        {icon}
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", flex: 1, textAlign: "left" }}>
          {title}
        </span>
        {open ? <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />
          : <ChevronRight size={14} style={{ color: "var(--text-muted)" }} />}
      </button>
      {open && (
        <div style={{ paddingTop: 4 }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Integration card ────────────────────────────────────────────────────────

function IntegrationCard({ name, icon, configured, detail, color }: {
  name: string;
  icon: React.ReactNode;
  configured: boolean;
  detail?: string;
  color: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "12px 14px", borderRadius: 10,
      background: "var(--bg-card)", border: "1px solid var(--border)",
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 9,
        background: configured ? `color-mix(in srgb, ${color} 15%, transparent)` : "var(--bg-tertiary)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: configured ? color : "var(--text-muted)",
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
          {name}
        </div>
        {detail && (
          <div style={{
            fontSize: 11, color: "var(--text-muted)", marginTop: 1,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {detail}
          </div>
        )}
      </div>
      <span style={{
        fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 5,
        background: configured
          ? "color-mix(in srgb, var(--green) 12%, transparent)"
          : "var(--bg-tertiary)",
        color: configured ? "var(--green)" : "var(--text-muted)",
        border: `1px solid ${configured ? "color-mix(in srgb, var(--green) 20%, transparent)" : "var(--border)"}`,
        flexShrink: 0,
      }}>
        {configured ? "ACTIVE" : "NOT SET"}
      </span>
    </div>
  );
}

// ── Config row (read-only) ──────────────────────────────────────────────────

function ConfigRow({ label, value }: { label: string; value: string | number | boolean }) {
  const display = typeof value === "boolean" ? (value ? "Enabled" : "Disabled") : String(value);
  const isBool = typeof value === "boolean";
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "8px 0",
      borderBottom: "1px solid var(--border)",
    }}>
      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
      {isBool ? (
        <span style={{
          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
          background: value ? "color-mix(in srgb, var(--green) 12%, transparent)" : "var(--bg-tertiary)",
          color: value ? "var(--green)" : "var(--text-muted)",
        }}>
          {display}
        </span>
      ) : (
        <span style={{
          fontSize: 12, color: "var(--text-primary)", fontFamily: "monospace",
          background: "var(--bg-tertiary)", padding: "2px 8px", borderRadius: 4,
        }}>
          {display}
        </span>
      )}
    </div>
  );
}

// ── Model tier row — custom Dropdown, configured providers only ──────────────

function ModelTierRow({ tier, slot, color, icon, providers, onSave, saving }: {
  tier: string;
  slot: ModelSlot | null;
  color: string;
  icon: React.ReactNode;
  providers: ProviderInfo[];
  onSave: (slot: ModelSlot | null) => void;
  saving: boolean;
}) {
  const [selProvider, setSelProvider] = useState(slot?.provider ?? "");
  const [selModel, setSelModel] = useState(slot?.model ?? "");
  const [dirty, setDirty] = useState(false);

  const currentProvider = providers.find((p) => p.id === selProvider);
  const models = currentProvider?.models ?? [];

  const providerOpts: DropdownOption[] = providers.map((p) => ({
    value: p.id,
    label: `${p.name} (${p.models.length})`,
    iconUrl: p.iconUrl,
  }));

  const modelOpts: DropdownOption[] = models.map((m) => ({
    value: m,
    label: m,
  }));

  function handleProviderChange(pid: string) {
    setSelProvider(pid);
    setSelModel("");
    setDirty(true);
  }

  function handleModelChange(mid: string) {
    setSelModel(mid);
    setDirty(true);
  }

  function handleApply() {
    if (selProvider && selModel) {
      onSave({ provider: selProvider, model: selModel });
    }
    setDirty(false);
  }

  function handleClear() {
    onSave(null);
    setSelProvider("");
    setSelModel("");
    setDirty(false);
  }

  return (
    <div style={{
      padding: "12px 14px", borderRadius: 10,
      background: "var(--bg-card)", border: "1px solid var(--border)",
    }}>
      {/* Label row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{
          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
          background: slot ? `color-mix(in srgb, ${color} 15%, transparent)` : "var(--bg-tertiary)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: slot ? color : "var(--text-muted)",
        }}>
          {icon}
        </div>
        <span style={{
          fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
          textTransform: "capitalize", flex: 1,
        }}>
          {tier}
        </span>
        {slot && (
          <span style={{
            fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
            background: `color-mix(in srgb, ${color} 12%, transparent)`,
            color,
          }}>
            SET
          </span>
        )}
      </div>

      {/* Dropdowns row */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Dropdown
          value={selProvider}
          onChange={handleProviderChange}
          options={providerOpts}
          placeholder="Select provider..."
          alignRight={false}
        />
        {selProvider && (
          <Dropdown
            value={selModel}
            onChange={handleModelChange}
            options={modelOpts}
            placeholder={`Select model (${models.length})...`}
            alignRight={false}
          />
        )}
        {dirty && selModel && (
          <button onClick={handleApply} disabled={saving} style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: 32, padding: "0 14px", borderRadius: 6, border: "none",
            background: "var(--accent)", color: "#fff", fontSize: 11, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
            opacity: saving ? 0.5 : 1,
          }}>
            <Check size={12} style={{ marginRight: 4 }} /> Apply
          </button>
        )}
        {slot && !dirty && (
          <button onClick={handleClear} disabled={saving} title="Clear this tier" style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 32, height: 32, borderRadius: 6, flexShrink: 0,
            border: "1px solid var(--border)", background: "transparent",
            color: "var(--text-muted)", cursor: "pointer", padding: 0,
          }}>
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function SettingsView() {
  // System settings (read-only)
  const { data: settings } = usePolling<SystemSettings>("/api/settings", 10000);

  // Model config
  const { data: modelData, refresh: refreshModels } = usePolling<ModelConfigData>("/api/model-config", 10000);
  const [modelSaving, setModelSaving] = useState(false);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [keySaving, setKeySaving] = useState(false);

  // MCP config (editable)
  const [mcpConfig, setMcpConfig] = useState<MCPConfig>({ mcpServers: {} });
  const [mcpStatus, setMcpStatus] = useState<MCPStatus>({ servers: [] });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchMCP = useCallback(async () => {
    try {
      const [cfgRes, statusRes] = await Promise.all([
        fetch(apiUrl("/api/mcp-config")).then(r => r.json()),
        fetch(apiUrl("/api/mcp-status")).then(r => r.json()),
      ]);
      setMcpConfig(cfgRes);
      setMcpStatus(statusRes);
      const exp: Record<string, boolean> = {};
      for (const k of Object.keys(cfgRes.mcpServers ?? {})) exp[k] = true;
      setExpanded(exp);
    } catch {
      showToast("Failed to load MCP config");
    } finally {
      /* loaded */
    }
  }, []);

  useEffect(() => { fetchMCP(); }, [fetchMCP]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  // Model tier save
  async function saveModelTier(tier: "primary" | "secondary" | "fallback", slot: ModelSlot | null) {
    setModelSaving(true);
    try {
      await postApi("/api/model-config", { [tier]: slot });
      refreshModels();
      showToast(`${tier.charAt(0).toUpperCase() + tier.slice(1)} model updated`);
    } catch { showToast("Failed to save model config"); }
    finally { setModelSaving(false); }
  }

  // Provider API key save
  async function saveProviderKey(providerId: string) {
    setKeySaving(true);
    try {
      await postApi("/api/provider-key", { provider: providerId, key: keyInput });
      refreshModels();
      showToast("API key saved");
      setEditingProvider(null);
      setKeyInput("");
    } catch { showToast("Failed to save API key"); }
    finally { setKeySaving(false); }
  }

  // MCP mutations
  function updateServer(name: string, patch: Partial<MCPServer>) {
    setMcpConfig(prev => {
      const next = deepClone(prev);
      next.mcpServers[name] = { ...next.mcpServers[name], ...patch };
      return next;
    });
    setDirty(true);
  }

  function removeServer(name: string) {
    setMcpConfig(prev => {
      const next = deepClone(prev);
      delete next.mcpServers[name];
      return next;
    });
    setDirty(true);
  }

  function addEnvVar(name: string) {
    const key = prompt("Environment variable name:");
    if (!key?.trim()) return;
    updateServer(name, {
      env: { ...mcpConfig.mcpServers[name].env, [key.trim()]: "" },
    });
  }

  function removeEnvVar(serverName: string, key: string) {
    const next = { ...mcpConfig.mcpServers[serverName].env };
    delete next[key];
    updateServer(serverName, { env: next });
  }

  async function saveConfig() {
    setSaving(true);
    try {
      const res = await postApi("/api/mcp-config", mcpConfig);
      if (res?.ok) {
        setDirty(false);
        showToast("Saved! Restart server to apply changes.");
        fetchMCP();
      } else {
        showToast("Save failed");
      }
    } catch {
      showToast("Save failed");
    } finally {
      setSaving(false);
    }
  }

  const serverNames = Object.keys(mcpConfig.mcpServers);
  const s = settings;
  const integ = s?.integrations;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div className="page-header" style={{ padding: "24px 28px 16px" }}>
        <h1 className="page-title">Settings</h1>
        <div className="page-subtitle">
          System configuration, integrations &amp; MCP servers
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 28px 28px" }}>

        {/* ═══ Integrations ═══ */}
        <Section title="Integrations" icon={<Zap size={15} style={{ color: "var(--accent)" }} />}>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 8,
          }}>
            <IntegrationCard
              name="Telegram"
              icon={<MessageSquare size={16} />}
              configured={integ?.telegram.configured ?? false}
              detail={integ?.telegram.configured ? `Chat: ${integ.telegram.chatId}` : "Set TELEGRAM_BOT_TOKEN + CHAT_ID"}
              color="var(--blue)"
            />
            <IntegrationCard
              name="Web Search (SearXNG)"
              icon={<Search size={16} />}
              configured={integ?.searxng.configured ?? false}
              detail={integ?.searxng.url ?? "Set SEARXNG_URL"}
              color="var(--green)"
            />
            <IntegrationCard
              name="SonarQube"
              icon={<Eye size={16} />}
              configured={integ?.sonarqube.configured ?? false}
              detail={integ?.sonarqube.configured
                ? `${integ.sonarqube.hostUrl} (${integ.sonarqube.projectKey})`
                : "Set SONAR_TOKEN to enable"}
              color="var(--blue)"
            />
            <IntegrationCard
              name="Gitleaks"
              icon={<Shield size={16} />}
              configured={integ?.gitleaks.configured ?? false}
              detail="Secret scanning via Docker"
              color="var(--red)"
            />
            <IntegrationCard
              name="Semgrep"
              icon={<Shield size={16} />}
              configured={integ?.semgrep.configured ?? false}
              detail="SAST — OWASP Top 10 scanning"
              color="var(--orange)"
            />
            <IntegrationCard
              name="Trivy"
              icon={<Database size={16} />}
              configured={integ?.trivy.configured ?? false}
              detail="SCA — dependency vulnerability scanning"
              color="var(--purple)"
            />
          </div>
        </Section>

        {/* ═══ Models ═══ */}
        <Section title="Models" icon={<Box size={15} style={{ color: "var(--purple)" }} />}>
          {modelData ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Provider list */}
              <div>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: "var(--text-muted)",
                  textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8,
                }}>
                  Providers
                </div>
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                  gap: 8,
                }}>
                  {modelData.providers.map((p) => {
                    const isEditing = editingProvider === p.id;
                    return (
                      <div key={p.id} style={{
                        display: "flex", flexDirection: "column", gap: 8,
                        padding: "10px 12px", borderRadius: 8,
                        background: "var(--bg-card)",
                        border: isEditing ? "1px solid var(--accent)" : "1px solid var(--border)",
                        transition: "border-color 0.15s",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <img
                            src={p.iconUrl}
                            alt={p.name}
                            style={{
                              width: 22, height: 22, flexShrink: 0, borderRadius: 4,
                              filter: "var(--icon-filter, none)",
                            }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                              {p.name}
                            </div>
                            <div style={{
                              fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace",
                            }}>
                              {p.models.length} models · {p.envKey || "—"}
                            </div>
                          </div>
                          <span style={{
                            fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                            background: p.configured
                              ? "color-mix(in srgb, var(--green) 12%, transparent)"
                              : "var(--bg-tertiary)",
                            color: p.configured ? "var(--green)" : "var(--text-muted)",
                          }}>
                            {p.configured ? "READY" : "NO KEY"}
                          </span>
                          <button
                            onClick={() => {
                              if (isEditing) { setEditingProvider(null); setKeyInput(""); }
                              else { setEditingProvider(p.id); setKeyInput(""); }
                            }}
                            style={{
                              fontSize: 10, fontWeight: 500, padding: "3px 8px", borderRadius: 5,
                              border: "1px solid var(--border)", background: "transparent",
                              color: isEditing ? "var(--accent)" : "var(--text-muted)",
                              cursor: "pointer", fontFamily: "inherit",
                            }}
                          >
                            {isEditing ? "Cancel" : p.configured ? "Edit Key" : "Set Key"}
                          </button>
                        </div>
                        {isEditing && (
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <input
                              value={keyInput}
                              onChange={(e) => setKeyInput(e.target.value)}
                              placeholder={`Paste ${p.envKey || "API key"}...`}
                              type="password"
                              autoFocus
                              style={{ ...inputStyle, flex: 1, fontSize: 12, fontFamily: "monospace" }}
                              onKeyDown={(e) => e.key === "Enter" && keyInput.trim() && saveProviderKey(p.id)}
                            />
                            <button
                              onClick={() => saveProviderKey(p.id)}
                              disabled={!keyInput.trim() || keySaving}
                              style={{
                                display: "flex", alignItems: "center", gap: 4,
                                padding: "7px 12px", borderRadius: 6, border: "none",
                                background: keyInput.trim() ? "var(--accent)" : "var(--bg-tertiary)",
                                color: keyInput.trim() ? "#fff" : "var(--text-muted)",
                                fontSize: 11, fontWeight: 600,
                                cursor: keyInput.trim() ? "pointer" : "default",
                                fontFamily: "inherit", flexShrink: 0,
                                opacity: keySaving ? 0.5 : 1,
                              }}
                            >
                              <Save size={11} /> Save
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Priority tiers */}
              <div>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: "var(--text-muted)",
                  textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8,
                }}>
                  Model Priority
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(["primary", "secondary", "fallback"] as const).map((tier) => {
                    const slot = modelData.config[tier];
                    const tierColors = {
                      primary: "var(--accent)",
                      secondary: "var(--yellow)",
                      fallback: "var(--text-muted)",
                    };
                    const tierIcons = {
                      primary: <Star size={12} />,
                      secondary: <Cpu size={12} />,
                      fallback: <Shield size={12} />,
                    };
                    const configuredProviders = modelData.providers.filter((p) => p.configured);
                    return (
                      <ModelTierRow
                        key={tier}
                        tier={tier}
                        slot={slot}
                        color={tierColors[tier]}
                        icon={tierIcons[tier]}
                        providers={configuredProviders}
                        onSave={(s) => saveModelTier(tier, s)}
                        saving={modelSaving}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Per-agent overrides summary */}
              {Object.keys(modelData.config.agentModels).length > 0 && (
                <div>
                  <div style={{
                    fontSize: 11, fontWeight: 600, color: "var(--text-muted)",
                    textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8,
                  }}>
                    Agent Overrides
                  </div>
                  <div style={{
                    display: "flex", flexWrap: "wrap", gap: 6,
                  }}>
                    {Object.entries(modelData.config.agentModels).map(([agentId, s]) => (
                      <span key={agentId} style={{
                        fontSize: 11, padding: "4px 10px", borderRadius: 6,
                        background: "var(--bg-card)", border: "1px solid var(--border)",
                        color: "var(--text-secondary)", fontFamily: "monospace",
                      }}>
                        @{agentId} → {s.provider}/{s.model.split("/").pop()}
                      </span>
                    ))}
                  </div>
                  <div style={{
                    fontSize: 11, color: "var(--text-muted)", marginTop: 6, paddingLeft: 2,
                  }}>
                    Per-agent models can be configured from the Directory view.
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 12, textAlign: "center" }}>Loading...</div>
          )}
        </Section>

        {/* ═══ LLM Configuration ═══ */}
        <Section title="LLM Defaults" icon={<Cpu size={15} style={{ color: "var(--purple)" }} />}>
          <div style={{
            background: "var(--bg-card)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "4px 14px",
          }}>
            {s ? (
              <>
                <ConfigRow label="Provider (env)" value={s.llm.provider} />
                <ConfigRow label="Model (env)" value={s.llm.model} />
                <ConfigRow label="Thinking Level" value={s.llm.thinkingLevel} />
                <ConfigRow label="Temperature" value={s.llm.temperature} />
                <ConfigRow label="Max Tokens" value={s.llm.maxTokens.toLocaleString()} />
              </>
            ) : (
              <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 12, textAlign: "center" }}>Loading...</div>
            )}
          </div>
          <div style={{
            fontSize: 11, color: "var(--text-muted)", marginTop: 8, paddingLeft: 2,
          }}>
            Environment defaults — overridden by Models priority above when set.
          </div>
        </Section>

        {/* ═══ System ═══ */}
        <Section title="System" icon={<Settings2 size={15} style={{ color: "var(--green)" }} />}>
          <div style={{
            background: "var(--bg-card)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "4px 14px",
          }}>
            {s ? (
              <>
                <ConfigRow label="Company Name" value={s.system.companyName} />
                <ConfigRow label="CLI" value={s.system.cliEnabled} />
                <ConfigRow label="PM Proactive Loop" value={s.proactive.enabled} />
                {s.proactive.enabled && (
                  <ConfigRow label="Proactive Interval" value={`${s.proactive.intervalSecs}s`} />
                )}
                <ConfigRow label="Dashboard Port" value={s.system.dashboardPort} />
                <ConfigRow label="Debounce Window" value={`${s.system.debounceMs}ms`} />
                <ConfigRow label="Context Window" value={`${(s.system.contextWindow / 1000).toFixed(0)}K tokens`} />
                <ConfigRow label="Compact Threshold" value={`${(s.system.compactThreshold * 100).toFixed(0)}%`} />
              </>
            ) : (
              <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 12, textAlign: "center" }}>Loading...</div>
            )}
          </div>
        </Section>

        {/* ═══ MCP Servers ═══ */}
        <Section
          title={`MCP Servers (${serverNames.length} active)`}
          icon={<Server size={15} style={{ color: "var(--orange)" }} />}
          defaultOpen={false}
        >
          {/* Top bar: status + save */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
          }}>
            <div style={{
              fontSize: 11, color: "var(--text-muted)", flex: 1,
            }}>
              {serverNames.length > 0 && (
                <span>
                  {serverNames.length} server{serverNames.length !== 1 ? "s" : ""} configured
                  {mcpStatus.servers.filter(s => s.connected).length > 0 && (
                    <span style={{ color: "var(--green)", marginLeft: 6 }}>
                      &bull; {mcpStatus.servers.filter(s => s.connected).length} connected
                    </span>
                  )}
                </span>
              )}
            </div>
            <button onClick={fetchMCP} style={btnSecondary} title="Refresh status">
              <RefreshCw size={12} />
            </button>
            {dirty && (
              <button onClick={saveConfig} disabled={saving} style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 12px", borderRadius: 6, border: "none",
                background: "var(--accent)", color: "#fff",
                cursor: saving ? "wait" : "pointer", fontSize: 11,
                fontWeight: 600, fontFamily: "inherit",
                opacity: saving ? 0.7 : 1,
              }}>
                <Save size={11} /> {saving ? "Saving..." : "Save"}
              </button>
            )}
          </div>

          {/* ── Server Directory + Custom Servers ─────────────────── */}
          <MCPDirectoryPanel
            activeServerNames={serverNames}
            mcpConfig={mcpConfig}
            mcpStatus={mcpStatus}
            onAdd={(entry, envOverrides) => {
              const env: Record<string, string> = {};
              for (const k of Object.keys(entry.envVars)) {
                env[k] = envOverrides?.[k] ?? "";
              }
              setMcpConfig(prev => {
                const next = deepClone(prev);
                next.mcpServers[entry.id] = {
                  command: entry.command,
                  args: [...entry.args],
                  env,
                };
                return next;
              });
              setDirty(true);
              showToast(`Added "${entry.name}" — click Save to apply`);
            }}
            onRemove={(name) => {
              removeServer(name);
            }}
            onAddCustom={(name, srv) => {
              setMcpConfig(prev => {
                const next = deepClone(prev);
                next.mcpServers[name] = srv;
                return next;
              });
              setExpanded(prev => ({ ...prev, [name]: true }));
              setDirty(true);
              showToast(`Added "${name}" — click Save to apply`);
            }}
            onUpdateCustom={(name, patch) => {
              updateServer(name, patch);
            }}
            onRemoveCustomEnv={(serverName, key) => {
              removeEnvVar(serverName, key);
            }}
            onAddCustomEnv={(name) => {
              addEnvVar(name);
            }}
            expanded={expanded}
            onToggleExpand={(name) => {
              setExpanded(p => ({ ...p, [name]: !p[name] }));
            }}
          />
        </Section>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24,
          background: "var(--bg-card)", border: "1px solid var(--border)",
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

// ── MCP Directory Panel ─────────────────────────────────────────────────────

const ALL_CATEGORIES: MCPCategory[] = [
  "dev-tools", "files", "browser", "search", "database",
  "productivity", "cloud", "communication", "ai", "design", "other",
];

/** IDs of all directory-known servers */
const DIRECTORY_IDS = new Set(MCP_DIRECTORY.map(e => e.id));

function MCPDirectoryPanel({ activeServerNames, mcpConfig, mcpStatus, onAdd, onRemove, onAddCustom, onUpdateCustom, onRemoveCustomEnv, onAddCustomEnv, expanded, onToggleExpand }: {
  activeServerNames: string[];
  mcpConfig: MCPConfig;
  mcpStatus: MCPStatus;
  onAdd: (entry: MCPDirectoryEntry, envOverrides?: Record<string, string>) => void;
  onRemove: (name: string) => void;
  onAddCustom: (name: string, srv: { command: string; args: string[]; env: Record<string, string> }) => void;
  onUpdateCustom: (name: string, patch: Partial<MCPServer>) => void;
  onRemoveCustomEnv: (serverName: string, key: string) => void;
  onAddCustomEnv: (name: string) => void;
  expanded: Record<string, boolean>;
  onToggleExpand: (name: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<MCPCategory | "all">("all");
  const [setupEntry, setSetupEntry] = useState<MCPDirectoryEntry | null>(null);
  const [envInputs, setEnvInputs] = useState<Record<string, string>>({});
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customCmd, setCustomCmd] = useState("npx");
  const [customArgs, setCustomArgs] = useState("");
  const [customEnvKey, setCustomEnvKey] = useState("");
  const [customEnvVal, setCustomEnvVal] = useState("");
  const [customEnv, setCustomEnv] = useState<Record<string, string>>({});

  // Separate custom servers (not in directory) from directory ones
  const customServerNames = activeServerNames.filter(n => !DIRECTORY_IDS.has(n));

  const q = search.toLowerCase();
  const filtered = MCP_DIRECTORY.filter(e => {
    if (catFilter !== "all" && e.category !== catFilter) return false;
    if (q && !e.name.toLowerCase().includes(q) && !e.description.toLowerCase().includes(q)
      && !e.tools.some(t => t.toLowerCase().includes(q))) return false;
    return true;
  });

  function handleAddClick(entry: MCPDirectoryEntry) {
    const hasEnv = Object.keys(entry.envVars).length > 0;
    if (hasEnv) {
      setSetupEntry(entry);
      const initial: Record<string, string> = {};
      for (const k of Object.keys(entry.envVars)) initial[k] = "";
      setEnvInputs(initial);
    } else {
      onAdd(entry);
    }
  }

  function confirmSetup() {
    if (!setupEntry) return;
    onAdd(setupEntry, envInputs);
    setSetupEntry(null);
    setEnvInputs({});
  }

  function handleAddCustom() {
    const name = customName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!name) return;
    if (activeServerNames.includes(name)) return;
    onAddCustom(name, {
      command: customCmd.trim(),
      args: customArgs.split("\n").map(s => s.trim()).filter(Boolean),
      env: { ...customEnv },
    });
    setShowCustom(false);
    setCustomName("");
    setCustomCmd("npx");
    setCustomArgs("");
    setCustomEnv({});
  }

  return (
    <div>
      {/* ── Server Directory header ──────────────────────────── */}
      <div style={{
        fontSize: 11, fontWeight: 600, color: "var(--text-muted)",
        textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10,
      }}>
        Server Directory
      </div>

      {/* Search + filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <Search size={13} style={{
            position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
            color: "var(--text-muted)", pointerEvents: "none",
          }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search servers or tools..."
            style={{ ...inputStyle, paddingLeft: 30 }}
          />
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <FilterChip label="All" active={catFilter === "all"} onClick={() => setCatFilter("all")} color="var(--text-muted)" />
          {ALL_CATEGORIES.filter(c => MCP_DIRECTORY.some(e => e.category === c)).map(c => (
            <FilterChip
              key={c}
              label={CATEGORY_META[c].label}
              active={catFilter === c}
              onClick={() => setCatFilter(c === catFilter ? "all" : c)}
              color={CATEGORY_META[c].color}
            />
          ))}
        </div>
      </div>

      {/* Setup panel (env var entry for a directory server) */}
      {setupEntry && (
        <div style={{
          background: "var(--bg-card)", border: "1px solid var(--accent)",
          borderRadius: 10, padding: 16, marginBottom: 12,
          animation: "fade-in 0.12s ease-out",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Package size={16} style={{ color: "var(--accent)" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                Setup: {setupEntry.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Fill in the required environment variables to configure this server.
              </div>
            </div>
            <button onClick={() => { setSetupEntry(null); setEnvInputs({}); }} style={{
              display: "flex", padding: 4, border: "none", borderRadius: 4,
              background: "transparent", color: "var(--text-muted)", cursor: "pointer",
            }}>
              <X size={14} />
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(setupEntry.envVars).map(([varName, hint]) => (
              <div key={varName} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{
                  fontSize: 12, fontFamily: "monospace", color: "var(--text-secondary)",
                  minWidth: 140, flexShrink: 0,
                }}>
                  {varName}
                </span>
                <input
                  value={envInputs[varName] ?? ""}
                  onChange={e => setEnvInputs(p => ({ ...p, [varName]: e.target.value }))}
                  placeholder={hint}
                  type="password"
                  style={{ ...inputStyle, flex: 1, fontFamily: "monospace", fontSize: 12 }}
                  onKeyDown={e => e.key === "Enter" && confirmSetup()}
                />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
            <button onClick={() => { setSetupEntry(null); setEnvInputs({}); }} style={btnSecondary}>
              Cancel
            </button>
            <button onClick={confirmSetup} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 14px", borderRadius: 6, border: "none",
              background: "var(--accent)", color: "#fff",
              cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit",
            }}>
              <Plus size={12} /> Add Server
            </button>
          </div>
        </div>
      )}

      {/* Directory grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 8, marginBottom: 14,
      }}>
        {filtered.map(entry => {
          const isActive = activeServerNames.includes(entry.id);
          const catMeta = CATEGORY_META[entry.category];
          const live = mcpStatus.servers.find(s => s.name === entry.id);
          return (
            <div key={entry.id} style={{
              display: "flex", flexDirection: "column", gap: 8,
              padding: "12px 14px", borderRadius: 10,
              background: "var(--bg-card)",
              border: isActive ? `1px solid color-mix(in srgb, var(--green) 40%, transparent)` : "1px solid var(--border)",
              transition: "border-color 0.15s",
            }}>
              {/* Top row: name + category + connection status */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                      {entry.name}
                    </span>
                    <span style={{
                      fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                      background: `color-mix(in srgb, ${catMeta.color} 12%, transparent)`,
                      color: catMeta.color,
                      flexShrink: 0,
                    }}>
                      {catMeta.label}
                    </span>
                    {isActive && live && (
                      <span style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: live.connected ? "var(--green)" : "var(--text-muted)",
                        flexShrink: 0,
                      }} title={live.connected ? "Connected" : "Disconnected"} />
                    )}
                  </div>
                  <div style={{
                    fontSize: 11, color: "var(--text-muted)", marginTop: 3,
                    lineHeight: 1.4,
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}>
                    {entry.description}
                  </div>
                </div>
              </div>

              {/* Tools preview */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {entry.tools.slice(0, 4).map(t => (
                  <span key={t} style={{
                    fontSize: 10, padding: "2px 6px", borderRadius: 4,
                    background: "var(--bg-tertiary)", color: "var(--text-secondary)",
                    fontFamily: "monospace",
                  }}>
                    {t}
                  </span>
                ))}
                {entry.tools.length > 4 && (
                  <span style={{
                    fontSize: 10, padding: "2px 6px", borderRadius: 4,
                    background: "var(--bg-tertiary)", color: "var(--text-muted)",
                  }}>
                    +{entry.tools.length - 4} more
                  </span>
                )}
              </div>

              {/* Bottom row: package + add/remove button */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto" }}>
                <span style={{
                  fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace",
                  flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {entry.package}
                </span>
                {Object.keys(entry.envVars).length > 0 && (
                  <span style={{
                    fontSize: 9, padding: "2px 5px", borderRadius: 3,
                    background: "color-mix(in srgb, var(--yellow) 12%, transparent)",
                    color: "var(--yellow)", flexShrink: 0,
                  }}>
                    KEY
                  </span>
                )}
                {entry.docsUrl && (
                  <a
                    href={entry.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex", padding: 4, borderRadius: 4,
                      color: "var(--text-muted)", flexShrink: 0,
                    }}
                    title="Docs"
                  >
                    <ExternalLink size={12} />
                  </a>
                )}
                {isActive ? (
                  <button
                    onClick={() => onRemove(entry.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "4px 10px", borderRadius: 5,
                      border: "1px solid var(--border)", background: "transparent",
                      color: "var(--text-muted)",
                      cursor: "pointer", fontSize: 10, fontWeight: 600,
                      fontFamily: "inherit", flexShrink: 0,
                      transition: "color 0.12s, border-color 0.12s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = "var(--red)"; e.currentTarget.style.borderColor = "var(--red)"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
                  >
                    <Trash2 size={10} /> Remove
                  </button>
                ) : (
                  <button
                    onClick={() => handleAddClick(entry)}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "4px 10px", borderRadius: 5, border: "none",
                      background: "var(--accent)", color: "#fff",
                      cursor: "pointer", fontSize: 10, fontWeight: 600,
                      fontFamily: "inherit", flexShrink: 0,
                    }}
                  >
                    <Plus size={10} /> Add
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{
          textAlign: "center", padding: "20px 0",
          color: "var(--text-muted)", fontSize: 12,
        }}>
          No servers match &ldquo;{search}&rdquo;.
        </div>
      )}

      {/* ── Custom Servers (editable) ─────────────────────────── */}
      {customServerNames.length > 0 && (
        <div style={{ marginTop: 16, marginBottom: 10 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: "var(--text-muted)",
            textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8,
          }}>
            Custom Servers
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {customServerNames.map(name => {
              const srv = mcpConfig.mcpServers[name];
              if (!srv) return null;
              const live = mcpStatus.servers.find(s => s.name === name);
              const isOpen = expanded[name] ?? false;
              return (
                <div key={name} style={{
                  background: "var(--bg-card)", border: "1px solid var(--border)",
                  borderRadius: 10, overflow: "hidden",
                }}>
                  {/* Header */}
                  <div
                    onClick={() => onToggleExpand(name)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 14px", cursor: "pointer",
                      borderBottom: isOpen ? "1px solid var(--border)" : "none",
                    }}
                  >
                    {isOpen ? <ChevronDown size={13} style={{ color: "var(--text-muted)" }} />
                      : <ChevronRight size={13} style={{ color: "var(--text-muted)" }} />}
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", flex: 1 }}>
                      {name}
                    </span>
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: live?.connected ? "var(--green)" : "var(--text-muted)",
                      flexShrink: 0,
                    }} title={live?.connected ? "Connected" : "Disconnected"} />
                    {live?.connected && (
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {live.tools.length} tool{live.tools.length !== 1 ? "s" : ""}
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemove(name); }}
                      title="Remove server"
                      style={{
                        display: "flex", padding: 4, border: "none", borderRadius: 4,
                        background: "transparent", color: "var(--text-muted)", cursor: "pointer",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = "var(--red)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {/* Body (expandable editor) */}
                  {isOpen && (
                    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                      <Field label="Command" hint="e.g. npx, node, python">
                        <input
                          value={srv.command}
                          onChange={e => onUpdateCustom(name, { command: e.target.value })}
                          placeholder="npx"
                          style={inputStyle}
                        />
                      </Field>
                      <Field label="Arguments" hint="One per line">
                        <textarea
                          value={(srv.args ?? []).join("\n")}
                          onChange={e => onUpdateCustom(name, { args: e.target.value.split("\n") })}
                          placeholder={"-y\n@your/mcp-package\n--flag"}
                          rows={3}
                          style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }}
                        />
                      </Field>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <label style={labelStyle}>Environment Variables</label>
                          <button onClick={() => onAddCustomEnv(name)} style={btnSecondary}>
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
                                }}>{k}</span>
                                <input
                                  value={v}
                                  onChange={e => onUpdateCustom(name, { env: { ...srv.env, [k]: e.target.value } })}
                                  placeholder="value"
                                  style={{ ...inputStyle, flex: 1 }}
                                />
                                <button
                                  onClick={() => onRemoveCustomEnv(name, k)}
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
                      {live?.connected && live.tools.length > 0 && (
                        <div>
                          <label style={labelStyle}>Discovered Tools</label>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                            {live.tools.map(t => (
                              <span key={t} style={{
                                fontSize: 11, padding: "2px 8px", borderRadius: 4,
                                background: "var(--bg-tertiary)", color: "var(--text-secondary)",
                                fontFamily: "monospace",
                              }}>{t}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Add Custom MCP Server ─────────────────────────────── */}
      {!showCustom ? (
        <button
          onClick={() => setShowCustom(true)}
          style={{
            display: "flex", alignItems: "center", gap: 6, width: "100%",
            padding: "12px 16px", borderRadius: 10, marginTop: 8,
            border: "1px dashed var(--border)", background: "transparent",
            color: "var(--text-muted)", cursor: "pointer",
            fontSize: 12, fontFamily: "inherit",
            transition: "border-color 0.15s, color 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          <Plus size={14} /> Add Custom MCP Server
        </button>
      ) : (
        <div style={{
          background: "var(--bg-card)", border: "1px solid var(--accent)",
          borderRadius: 10, padding: 16, marginTop: 8,
          animation: "fade-in 0.12s ease-out",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Server size={15} style={{ color: "var(--accent)" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", flex: 1 }}>
              Add Custom MCP Server
            </span>
            <button onClick={() => setShowCustom(false)} style={{
              display: "flex", padding: 4, border: "none", borderRadius: 4,
              background: "transparent", color: "var(--text-muted)", cursor: "pointer",
            }}>
              <X size={14} />
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Field label="Server Name" hint="e.g. my-server">
              <input
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder="my-custom-server"
                style={inputStyle}
              />
            </Field>
            <Field label="Command" hint="e.g. npx, node, python, docker">
              <input
                value={customCmd}
                onChange={e => setCustomCmd(e.target.value)}
                placeholder="npx"
                style={inputStyle}
              />
            </Field>
            <Field label="Arguments" hint="One per line">
              <textarea
                value={customArgs}
                onChange={e => setCustomArgs(e.target.value)}
                placeholder={"-y\n@your/mcp-package\n--flag"}
                rows={3}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }}
              />
            </Field>
            <div>
              <label style={labelStyle}>Environment Variables</label>
              {Object.keys(customEnv).length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                  {Object.entries(customEnv).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{
                        fontSize: 12, fontFamily: "monospace", color: "var(--text-secondary)",
                        minWidth: 100, flexShrink: 0,
                      }}>{k}</span>
                      <input
                        value={v}
                        onChange={e => setCustomEnv(p => ({ ...p, [k]: e.target.value }))}
                        placeholder="value"
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <button
                        onClick={() => setCustomEnv(p => { const n = { ...p }; delete n[k]; return n; })}
                        style={{
                          display: "flex", padding: 4, border: "none",
                          background: "transparent", color: "var(--text-muted)",
                          cursor: "pointer", borderRadius: 4,
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  value={customEnvKey}
                  onChange={e => setCustomEnvKey(e.target.value)}
                  placeholder="VAR_NAME"
                  style={{ ...inputStyle, flex: 1, fontFamily: "monospace", fontSize: 12 }}
                />
                <input
                  value={customEnvVal}
                  onChange={e => setCustomEnvVal(e.target.value)}
                  placeholder="value"
                  style={{ ...inputStyle, flex: 1, fontSize: 12 }}
                />
                <button
                  onClick={() => {
                    if (customEnvKey.trim()) {
                      setCustomEnv(p => ({ ...p, [customEnvKey.trim()]: customEnvVal }));
                      setCustomEnvKey("");
                      setCustomEnvVal("");
                    }
                  }}
                  style={btnSecondary}
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
            <button onClick={() => setShowCustom(false)} style={btnSecondary}>
              Cancel
            </button>
            <button
              onClick={handleAddCustom}
              disabled={!customName.trim() || !customCmd.trim()}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "6px 14px", borderRadius: 6, border: "none",
                background: customName.trim() && customCmd.trim() ? "var(--accent)" : "var(--bg-tertiary)",
                color: customName.trim() && customCmd.trim() ? "#fff" : "var(--text-muted)",
                cursor: customName.trim() && customCmd.trim() ? "pointer" : "default",
                fontSize: 11, fontWeight: 600, fontFamily: "inherit",
              }}
            >
              <Plus size={12} /> Add Server
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick, color }: {
  label: string; active: boolean; onClick: () => void; color: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "3px 9px", borderRadius: 5, border: "none",
        background: active ? `color-mix(in srgb, ${color} 15%, transparent)` : "var(--bg-tertiary)",
        color: active ? color : "var(--text-muted)",
        fontSize: 10, fontWeight: active ? 600 : 500,
        cursor: "pointer", fontFamily: "inherit",
        transition: "background 0.1s, color 0.1s",
      }}
    >
      {label}
    </button>
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

const btnSecondary: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 5,
  padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)",
  background: "var(--bg-tertiary)", color: "var(--text-secondary)",
  cursor: "pointer", fontSize: 11, fontFamily: "inherit",
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
