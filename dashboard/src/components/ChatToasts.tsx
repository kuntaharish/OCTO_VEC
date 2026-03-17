import { MessageSquare, X } from "lucide-react";
import { useEmployees } from "../context/EmployeesContext";
import type { ChatToast } from "../hooks/useChatNotifications";

interface Props {
  toasts: ChatToast[];
  onDismiss: (id: number) => void;
  onClickToast: (agentId: string) => void;
}

export default function ChatToasts({ toasts, onDismiss, onClickToast }: Props) {
  const { employees } = useEmployees();

  if (toasts.length === 0) return null;

  const agentName = (id: string) => {
    const emp = employees?.find(e => e.agent_key === id);
    return emp?.name?.split(" ")[0] ?? id;
  };

  const agentColor = (id: string) => {
    const emp = employees?.find(e => e.agent_key === id);
    return emp?.color ?? "var(--accent)";
  };

  return (
    <div style={{
      position: "fixed", bottom: 20, right: 20,
      display: "flex", flexDirection: "column-reverse", gap: 8,
      zIndex: 9999, pointerEvents: "none",
    }}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            pointerEvents: "auto",
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "10px 14px", borderRadius: 10,
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderLeft: `3px solid ${agentColor(toast.agentId)}`,
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            minWidth: 280, maxWidth: 360,
            cursor: "pointer",
            animation: "toast-slide-in 0.25s ease-out",
          }}
          onClick={() => onClickToast(toast.agentId)}
        >
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: agentColor(toast.agentId),
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <MessageSquare size={13} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 2,
            }}>
              {agentName(toast.agentId)}
            </div>
            <div style={{
              fontSize: 11, color: "var(--text-secondary)",
              overflow: "hidden", textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
              lineHeight: 1.4,
            }}>
              {toast.message.slice(0, 120)}
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss(toast.id); }}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-muted)", padding: 2, flexShrink: 0,
              display: "flex", alignItems: "center",
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
