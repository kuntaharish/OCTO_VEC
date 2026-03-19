import { useState, useEffect } from "react";
import { ThemeProvider } from "./context/ThemeContext";
import { EmployeesProvider } from "./context/EmployeesContext";
import Sidebar, { type View } from "./components/Sidebar";
import KanbanView from "./views/KanbanView";
import OverviewView from "./views/OverviewView";
import EventsView from "./views/EventsView";
import SnoopView from "./views/QueueView";
import DirectoryView from "./views/DirectoryView";
import ChatView from "./views/ChatView";

import LiveView from "./views/LiveView";
import FinanceView from "./views/FinanceView";
import RemindersView from "./views/RemindersView";
import SettingsView from "./views/SettingsView";
import WorkspaceView from "./views/WorkspaceView";
import OnboardingView from "./views/OnboardingView";
import WelcomeTour, { WelcomeSplash, markTourDone } from "./components/WelcomeTour";
import { apiUrl, startTokenRefresh, stopTokenRefresh } from "./hooks/useApi";
import { useChatNotifications } from "./hooks/useChatNotifications";
import ChatToasts from "./components/ChatToasts";

// Restore chat colors from localStorage on startup
(function restoreChatColors() {
  try {
    const saved = localStorage.getItem("vec-chat-colors");
    if (!saved) return;
    const c = JSON.parse(saved);
    const root = document.documentElement;
    if (c.userBubble) root.style.setProperty("--chat-user-bubble", c.userBubble);
    if (c.userText) root.style.setProperty("--chat-user-text", c.userText);
    if (c.agentBubble) root.style.setProperty("--chat-agent-bubble", c.agentBubble);
    if (c.agentText) root.style.setProperty("--chat-agent-text", c.agentText);
    if (c.timestampUser) root.style.setProperty("--chat-ts-user", c.timestampUser);
    if (c.timestampAgent) root.style.setProperty("--chat-ts-agent", c.timestampAgent);
  } catch { /* ignore */ }
})();

export default function App() {
  const [activeView, setActiveViewRaw] = useState<View>(() => {
    const saved = localStorage.getItem("active-view");
    return saved && ["overview","kanban","events","snoop","directory","chat","live","finance","reminders","workspace","settings"].includes(saved)
      ? (saved as View)
      : "kanban";
  });

  // Auth state: null = loading, true = authed, false = needs login
  const [authed, setAuthed] = useState<boolean | null>(null);
  // Onboarding state: null = loading, true = show onboarding, false = done
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  // Tour phases
  const [tourPhase, setTourPhase] = useState<"splash" | "walkthrough" | null>(null);

  // Check auth status on mount
  useEffect(() => {
    fetch("/api/auth/status", { credentials: "include" })
      .then(r => r.json())
      .then(data => setAuthed(data.authenticated === true))
      .catch(() => setAuthed(false));
  }, []);

  // Listen for session expiry from authFetch
  useEffect(() => {
    const handler = () => { setAuthed(false); stopTokenRefresh(); };
    window.addEventListener("vec:auth-expired", handler);
    return () => window.removeEventListener("vec:auth-expired", handler);
  }, []);

  // Once authed, check onboarding + start token refresh
  useEffect(() => {
    if (!authed) return;
    startTokenRefresh();
    fetch("/api/onboarding", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) { setShowOnboarding(false); return; }
        const needsOnboarding = !data.done;
        setShowOnboarding(needsOnboarding);
        if (!needsOnboarding && !data.tourDone) setTourPhase("splash");
      })
      .catch(() => setShowOnboarding(false));
  }, [authed]);

  function setActiveView(v: View) {
    localStorage.setItem("active-view", v);
    setActiveViewRaw(v);
  }

  function handleAuthSuccess() {
    setAuthed(true);
    startTokenRefresh();
  }

  // Loading
  if (authed === null) {
    return (
      <ThemeProvider>
        <div style={{
          height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--bg-primary)",
        }} />
      </ThemeProvider>
    );
  }

  // Not authed OR needs onboarding — both go through OnboardingView
  // OnboardingView handles the auth step internally when needsAuth=true
  if (!authed || showOnboarding) {
    return (
      <ThemeProvider>
        <OnboardingView
          needsAuth={!authed}
          onAuthSuccess={handleAuthSuccess}
          onComplete={() => { setShowOnboarding(false); setTourPhase("splash"); }}
        />
      </ThemeProvider>
    );
  }

  // Still loading onboarding check
  if (showOnboarding === null) {
    return (
      <ThemeProvider>
        <div style={{
          height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--bg-primary)",
        }} />
      </ThemeProvider>
    );
  }

  // Welcome splash
  if (tourPhase === "splash") {
    return (
      <ThemeProvider>
        <WelcomeSplash
          onStart={() => setTourPhase("walkthrough")}
          onSkip={() => { markTourDone(); setTourPhase(null); }}
        />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
    <EmployeesProvider>
      <DashboardShell activeView={activeView} setActiveView={setActiveView} tourPhase={tourPhase} setTourPhase={setTourPhase} />
    </EmployeesProvider>
    </ThemeProvider>
  );
}

function DashboardShell({ activeView, setActiveView, tourPhase, setTourPhase }: {
  activeView: View; setActiveView: (v: View) => void;
  tourPhase: "splash" | "walkthrough" | null; setTourPhase: (v: "splash" | "walkthrough" | null) => void;
}) {
  const { unreadCount, perAgentUnread, toasts, markAgentRead, dismissToast } = useChatNotifications(activeView);

  function handleToastClick(agentId: string) {
    sessionStorage.setItem("chat_selected_agent", agentId);
    setActiveView("chat");
    markAgentRead(agentId);
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg-primary)" }}>
      <Sidebar activeView={activeView} setActiveView={setActiveView} chatBadge={unreadCount} />
      <main style={{
        flex: 1, overflow: "hidden", display: "flex", flexDirection: "column",
        background: "var(--bg-card)",
        borderRadius: 14,
        margin: 8,
        boxShadow: "var(--shadow-lg)",
        border: "1px solid var(--border)",
      }}>
        {activeView === "overview" && <OverviewView />}
        {activeView === "kanban" && <KanbanView />}
        {activeView === "events" && <EventsView />}
        {activeView === "snoop" && <SnoopView />}
        {activeView === "directory" && <DirectoryView />}
        {activeView === "chat" && <ChatView perAgentUnread={perAgentUnread} onAgentRead={markAgentRead} />}
        {activeView === "live" && <LiveView />}
        {activeView === "finance" && <FinanceView />}
        {activeView === "reminders" && <RemindersView />}
        {activeView === "workspace" && <WorkspaceView />}
        {activeView === "settings" && <SettingsView />}
      </main>

      {tourPhase === "walkthrough" && (
        <WelcomeTour
          setActiveView={setActiveView}
          onDone={() => { markTourDone(); setTourPhase(null); }}
        />
      )}

      <ChatToasts toasts={toasts} onDismiss={dismissToast} onClickToast={handleToastClick} />
    </div>
  );
}
