import { useRef, useEffect, useState } from "react";
import { useAgentStream, type ActivityEntry } from "../hooks/useSSE";

const AGENT_COLOR: Record<string, string> = {
  pm: "var(--purple)", dev: "var(--blue)", ba: "var(--green)",
  qa: "var(--yellow)", security: "var(--red)", devops: "var(--orange)",
};
const AGENT_BG: Record<string, string> = {
  pm: "var(--purple-bg)", dev: "var(--blue-bg)", ba: "var(--green-bg)",
  qa: "var(--yellow-bg)", security: "var(--red-bg)", devops: "var(--orange-bg)",
};

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([k, v]) => {
      const s = typeof v === "string" ? v : JSON.stringify(v);
      return `${k}: ${s.length > 80 ? s.slice(0, 80) + "…" : s}`;
    })
    .join("\n");
}

function Badge({ id }: { id: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600,
      color: AGENT_COLOR[id] ?? "var(--text-muted)",
      background: AGENT_BG[id] ?? "var(--bg-tertiary)",
      padding: "1px 5px", borderRadius: 3, whiteSpace: "nowrap", flexShrink: 0,
    }}>
      {id}
    </span>
  );
}

function EntryRow({ entry, isNew }: { entry: ActivityEntry; isNew: boolean }) {
  const ts = <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace", whiteSpace: "nowrap", minWidth: 60, flexShrink: 0 }}>{fmtTime(entry.timestamp)}</span>;

  if (entry.type === "tool_start") {
    return (
      <div className={isNew ? "fade-in" : ""} style={{ display: "flex", gap: 8, padding: "6px 20px", borderBottom: "1px solid var(--border)", alignItems: "flex-start" }}>
        {ts}
        <Badge id={entry.agentId} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>{entry.toolName ?? entry.content}</span>
            <span style={{ fontSize: 9, color: "var(--blue)", fontWeight: 500, marginLeft: "auto" }}>running</span>
          </div>
          {entry.toolArgs && Object.keys(entry.toolArgs).length > 0 && (
            <pre style={{
              fontSize: 10, fontFamily: "monospace", color: "var(--text-muted)",
              background: "var(--bg-tertiary)", borderRadius: 4, padding: "4px 8px",
              margin: "3px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-all",
              maxHeight: 100, overflowY: "auto",
            }}>
              {formatArgs(entry.toolArgs)}
            </pre>
          )}
        </div>
      </div>
    );
  }

  if (entry.type === "tool_end") {
    const err = entry.isError;
    return (
      <div className={isNew ? "fade-in" : ""} style={{ display: "flex", gap: 8, padding: "6px 20px", borderBottom: "1px solid var(--border)", alignItems: "flex-start" }}>
        {ts}
        <Badge id={entry.agentId} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: err ? "var(--red)" : "var(--text-secondary)" }}>
            {entry.toolName ?? ""} {err ? "failed" : "done"}
          </span>
          {entry.toolResult && (
            <pre style={{
              fontSize: 10, fontFamily: "monospace",
              color: err ? "var(--red)" : "var(--text-muted)",
              background: err ? "var(--red-bg)" : "var(--bg-tertiary)",
              borderRadius: 4, padding: "4px 8px",
              margin: "3px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-all",
              maxHeight: 100, overflowY: "auto",
            }}>
              {entry.toolResult}
            </pre>
          )}
        </div>
      </div>
    );
  }

  if (entry.type === "text") {
    return (
      <div className={isNew ? "fade-in" : ""} style={{ display: "flex", gap: 8, padding: "6px 20px", borderBottom: "1px solid var(--border)", alignItems: "flex-start" }}>
        {ts}
        <Badge id={entry.agentId} />
        <span style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, wordBreak: "break-word", flex: 1 }}>
          {entry.content}
        </span>
      </div>
    );
  }

  if (entry.type === "thinking") {
    return (
      <div className={isNew ? "fade-in" : ""} style={{ display: "flex", gap: 8, padding: "6px 20px", borderBottom: "1px solid var(--border)", alignItems: "flex-start", opacity: 0.6 }}>
        {ts}
        <Badge id={entry.agentId} />
        <span style={{
          fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5, fontStyle: "italic",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden", flex: 1,
        }}>
          {entry.content}
        </span>
      </div>
    );
  }

  // agent_start / agent_end
  const isStart = entry.type === "agent_start";
  return (
    <div className={isNew ? "fade-in" : ""} style={{ display: "flex", gap: 8, padding: "6px 20px", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
      {ts}
      <Badge id={entry.agentId} />
      <span style={{ fontSize: 12, fontWeight: 500, color: isStart ? "var(--green)" : "var(--text-muted)" }}>
        {isStart ? "Started" : "Finished"}
      </span>
    </div>
  );
}

type FilterType = "all" | "tools" | "text" | "thinking";

export default function ActivityView() {
  const { activity, connected } = useAgentStream();
  const [filter, setFilter] = useState<FilterType>("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLen = useRef(0);

  const agents = ["all", ...Array.from(new Set(activity.map((e) => e.agentId)))];
  const visible = activity.filter((e) => {
    if (agentFilter !== "all" && e.agentId !== agentFilter) return false;
    if (filter === "tools") return e.type === "tool_start" || e.type === "tool_end";
    if (filter === "text") return e.type === "text";
    if (filter === "thinking") return e.type === "thinking";
    return true;
  });

  useEffect(() => {
    if (autoScroll && activity.length !== prevLen.current) {
      prevLen.current = activity.length;
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activity, autoScroll]);

  const newIds = new Set(activity.slice(-5).map((e) => e.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div className="page-header" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h1 className="page-title">Activity</h1>
          <div className="page-subtitle">
            {connected ? "Connected" : "Disconnected"} · {visible.length} events
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
          {(["all", "tools", "text", "thinking"] as FilterType[]).map((f) => (
            <button key={f} className={`filter-tab${filter === f ? " active" : ""}`} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            style={{ fontSize: 11, padding: "3px 6px", borderRadius: 4, background: "var(--bg-tertiary)", color: "var(--text-secondary)", border: "1px solid var(--border)", cursor: "pointer", marginLeft: 4 }}
          >
            {agents.map((a) => <option key={a} value={a}>{a === "all" ? "All agents" : a}</option>)}
          </select>
          <button
            className={`filter-tab${autoScroll ? " active" : ""}`}
            onClick={() => setAutoScroll((v) => !v)}
            style={{ marginLeft: 4 }}
          >
            Auto-scroll
          </button>
        </div>
      </div>

      {/* Feed */}
      <div
        style={{ flex: 1, overflowY: "auto" }}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
        }}
      >
        {visible.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, color: "var(--text-muted)" }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>No activity yet</div>
            <div style={{ fontSize: 12 }}>Events appear here as agents run</div>
          </div>
        ) : (
          visible.map((entry) => <EntryRow key={entry.id} entry={entry} isNew={newIds.has(entry.id)} />)
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
