import notifee, { AndroidImportance } from "@notifee/react-native";
import EncryptedStorage from "react-native-encrypted-storage";

const CHANNEL_ID = "octo-vec-alerts";

let _lastEventTs = "";
let _lastMsgCount = 0;
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

async function notify(title: string, body: string, id?: string) {
  await notifee.displayNotification({
    id: id || undefined,
    title,
    body,
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

    // Check unread chats — notify if new unreads
    if (summary.unreadChats > _lastMsgCount && _lastMsgCount >= 0) {
      const diff = summary.unreadChats - _lastMsgCount;
      if (diff > 0 && _lastMsgCount > 0) {
        await notify("New Messages", `${diff} new message${diff > 1 ? "s" : ""} from agents`, "msg-unread");
      }
    }
    _lastMsgCount = summary.unreadChats;

    // Check pending approvals
    if (summary.pendingApprovals > 0) {
      await notify("Approval Needed", `${summary.pendingApprovals} agent${summary.pendingApprovals > 1 ? "s" : ""} waiting for approval`, "approvals");
    }

    // Check task status changes
    const tasks: any[] = await apiFetch("/api/m/tasks").catch(() => []);
    for (const t of tasks) {
      const prev = _knownTaskStatuses[t.id];
      if (prev && prev !== t.status) {
        if (t.status === "completed") {
          await notify("Task Completed", t.title || t.id, `task-${t.id}`);
        } else if (t.status === "failed") {
          await notify("Task Failed", t.title || t.id, `task-${t.id}`);
        }
      }
      _knownTaskStatuses[t.id] = t.status;
    }
  } catch {}
}
