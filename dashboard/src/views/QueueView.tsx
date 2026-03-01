import { usePolling } from "../hooks/useApi";
import type { QueueMessage } from "../types";

export default function QueueView() {
  const { data: pmQueue, lastRefresh } = usePolling<QueueMessage[]>("/api/queue", 3000);
  const { data: agentMessages } = usePolling<QueueMessage[]>("/api/agent-messages", 3000);

  const pmMsgs = pmQueue ?? [];
  const agentMsgs = agentMessages ?? [];

  function Row({ msg, i }: { msg: QueueMessage; i: number }) {
    const text = msg.message ?? msg.text ?? JSON.stringify(msg);
    const from = msg.from_agent ?? msg.sender ?? "system";
    const to = msg.to_agent ?? "pm";
    const priority = msg.priority ?? "normal";
    const ts = msg.timestamp;
    const pColor = priority === "priority" ? "var(--red)" : priority === "high" ? "var(--yellow)" : "var(--text-muted)";

    return (
      <div style={{
        padding: "10px 0", borderBottom: "1px solid var(--border)",
        display: "flex", gap: 10, alignItems: "flex-start",
      }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 18, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>{from}</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>→</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--accent)" }}>{to}</span>
            {msg.task_id && <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-muted)" }}>{msg.task_id}</span>}
            <span style={{ marginLeft: "auto", fontSize: 10, color: pColor, fontWeight: 500 }}>{priority}</span>
            {ts && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{new Date(ts).toLocaleTimeString()}</span>}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>{text}</div>
        </div>
      </div>
    );
  }

  function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>{title}</span>
          <span style={{ fontSize: 10, color: "var(--text-muted)", background: "var(--bg-tertiary)", padding: "1px 5px", borderRadius: 4 }}>{count}</span>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div className="page-header">
        <h1 className="page-title">Queue</h1>
        <div className="page-subtitle">
          {lastRefresh && <>Updated {lastRefresh.toLocaleTimeString()}</>}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "4px 24px 20px" }}>
        <Section title="PM Inbox" count={pmMsgs.length}>
          {pmMsgs.length === 0
            ? <div style={{ color: "var(--text-muted)", fontSize: 12, padding: "12px 0" }}>Empty</div>
            : pmMsgs.map((m, i) => <Row key={i} msg={m} i={i} />)
          }
        </Section>
        <Section title="Agent Messages" count={agentMsgs.length}>
          {agentMsgs.length === 0
            ? <div style={{ color: "var(--text-muted)", fontSize: 12, padding: "12px 0" }}>Empty</div>
            : agentMsgs.map((m, i) => <Row key={i} msg={m} i={i} />)
          }
        </Section>
      </div>
    </div>
  );
}
