import notifee, { AndroidImportance } from "@notifee/react-native";
import EncryptedStorage from "react-native-encrypted-storage";

const CHANNEL_ID = "octo-vec-alerts";

let _lastEventTs = "";
let _lastMsgCount = 0;
let _lastApprovalCount = 0;
let _knownTaskStatuses: Record<string, string> = {};

async function getCredentials() {
  const serverUrl = (await EncryptedStorage.getItem("server_url")) ?? "";
  const apiKey = (await EncryptedStorage.getItem("api_key")) ?? "";
  const relayMode = (await EncryptedStorage.getItem("relay_mode")) === "true";
  const relaySecret = (await EncryptedStorage.getItem("relay_secret")) ?? "";
  const sessionId = (await EncryptedStorage.getItem("relay_session")) ?? "default";
  return { serverUrl, apiKey, relayMode, relaySecret, sessionId };
}

async function apiFetch(path: string) {
  const { serverUrl, apiKey, relayMode, relaySecret, sessionId } = await getCredentials();
  if (!serverUrl) throw new Error("Not logged in");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let url: string;

  if (relayMode) {
    url = `${serverUrl}/relay${path}`;
    headers["X-Relay-Secret"] = relaySecret;
    headers["X-Session-Id"] = sessionId;
  } else {
    const sep = (path || "").includes("?") ? "&" : "?";
    url = `${serverUrl}${path}${sep}key=${encodeURIComponent(apiKey)}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function notify(title: string, body: string, id?: string, data?: Record<string, string>) {
  await notifee.displayNotification({
    id: id || undefined,
    title,
    body,
    data: data ?? {},
    android: {
      channelId: CHANNEL_ID,
      smallIcon: "ic_launcher",
      pressAction: { id: "default" },
      importance: AndroidImportance.HIGH,
      sound: "default",
    },
  });
}

export async function seedState() {
  try {
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: "OCTO VEC Alerts",
      importance: AndroidImportance.HIGH,
      vibration: true,
      sound: "default",
    });

    // Use mobile summary to seed — single API call
    const summary = await apiFetch("/api/m/summary").catch(() => null);
    if (summary) {
      if (summary.events?.length > 0) _lastEventTs = summary.events[0].timestamp;
      _lastApprovalCount = summary.pendingApprovals || 0;
      // Seed task statuses
      const tasks: any[] = await apiFetch("/api/m/tasks").catch(() => []);
      for (const t of tasks) _knownTaskStatuses[t.id] = t.status;
    }

    // Seed message count
    const chats: any[] = await apiFetch("/api/m/chats").catch(() => []);
    _lastMsgCount = chats.reduce((sum: number, c: any) => sum + (c.unread || 0), 0);
  } catch {}
}

export async function poll() {
  try {
    const creds = await getCredentials();
    if (!creds.serverUrl) return;

    // Single call for summary
    const summary = await apiFetch("/api/m/summary").catch(() => null);
    if (!summary) return;

    // Check for new events
    const events = summary.events || [];
    if (events.length > 0 && events[0].timestamp && events[0].timestamp !== _lastEventTs) {
      const newEvents = _lastEventTs
        ? events.filter((e: any) => e.timestamp > _lastEventTs)
        : [];
      _lastEventTs = events[0].timestamp;

      // Only notify on meaningful events — skip internal/system noise
      const SKIP_TYPES = ["llm_request", "llm_response", "thinking", "agent_start", "agent_end", "tool_start", "tool_end", "no_action"];
      for (const ev of newEvents.slice(0, 3)) {
        const evType = (ev.type || "").toLowerCase();
        if (SKIP_TYPES.some(s => evType.includes(s))) continue;
        const agent = ev.agent || "System";
        const type = (ev.type || "event").replace(/_/g, " ");
        await notify(agent, type + (ev.message ? `: ${ev.message}` : ""), `event-${ev.timestamp}`);
      }
    }

    // Check unread chats — notify per agent with their name
    if (summary.unreadChats > _lastMsgCount && _lastMsgCount >= 0) {
      const diff = summary.unreadChats - _lastMsgCount;
      if (diff > 0 && _lastMsgCount > 0) {
        const chats: any[] = await apiFetch("/api/m/chats").catch(() => []);
        const unreadChats = chats.filter((c: any) => c.unread > 0);

        if (unreadChats.length === 1) {
          const agent = unreadChats[0];
          const firstName = (agent.name || "Agent").split(" ")[0];
          await notify(
            firstName,
            `${firstName} messaged you`,
            `msg-${agent.key}`,
            {
              action: "chat",
              agentKey: agent.key || "",
              agentName: agent.name || "",
              agentInitials: agent.initials || "",
              agentRole: agent.role || "",
            },
          );
        } else if (unreadChats.length > 1) {
          const names = unreadChats.slice(0, 3).map((c: any) => (c.name || "Agent").split(" ")[0]);
          const nameStr = names.join(", ") + (unreadChats.length > 3 ? ` +${unreadChats.length - 3} more` : "");
          await notify(
            "New Messages",
            `${nameStr} messaged you`,
            "msg-unread",
            {
              action: "chat",
              agentKey: unreadChats[0].key || "",
              agentName: unreadChats[0].name || "",
              agentInitials: unreadChats[0].initials || "",
              agentRole: unreadChats[0].role || "",
            },
          );
        }
      }
    }
    _lastMsgCount = summary.unreadChats;

    // Check pending approvals — notify per agent with their name
    const currentApprovals = summary.pendingApprovals || 0;
    if (currentApprovals > _lastApprovalCount) {
      // Fetch actual approval details to get agent names
      const approvalList: any[] = await apiFetch("/api/m/approvals").catch(() => []);

      if (approvalList.length === 1) {
        const a = approvalList[0];
        const firstName = (a.agentName || "Agent").split(" ")[0];
        const toolName = a.context?.toolName || a.title || "a tool";
        await notify(
          firstName,
          `${firstName} requires approval for ${toolName}`,
          "approvals",
          { action: "live" },
        );
      } else if (approvalList.length > 1) {
        // Group by agent name
        const agentNames = [...new Set(approvalList.map((a: any) => (a.agentName || "Agent").split(" ")[0]))];
        const nameStr = agentNames.slice(0, 3).join(", ") + (agentNames.length > 3 ? ` +${agentNames.length - 3}` : "");
        await notify(
          "Approval Needed",
          `${nameStr} require${agentNames.length === 1 ? "s" : ""} approval`,
          "approvals",
          { action: "live" },
        );
      }
    } else if (currentApprovals === 0 && _lastApprovalCount > 0) {
      await notifee.cancelNotification("approvals");
    }
    _lastApprovalCount = currentApprovals;

    // Check task status changes
    const tasks: any[] = await apiFetch("/api/m/tasks").catch(() => []);
    for (const t of tasks) {
      const prev = _knownTaskStatuses[t.id];
      if (prev && prev !== t.status) {
        if (t.status === "completed") {
          await notify("Task Completed", t.title || t.id, `task-${t.id}`, { action: "tasks" });
        } else if (t.status === "failed") {
          await notify("Task Failed", t.title || t.id, `task-${t.id}`, { action: "tasks" });
        }
      }
      _knownTaskStatuses[t.id] = t.status;
    }
  } catch {}
}
