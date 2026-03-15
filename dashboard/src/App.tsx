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
import SettingsView from "./views/SettingsView";
import OnboardingView from "./views/OnboardingView";
import WelcomeTour, { WelcomeSplash, markTourDone } from "./components/WelcomeTour";
import { apiUrl } from "./hooks/useApi";

export default function App() {
  const [activeView, setActiveViewRaw] = useState<View>(() => {
    const saved = localStorage.getItem("active-view");
    return saved && ["overview","kanban","events","snoop","directory","chat","live","finance","settings"].includes(saved)
      ? (saved as View)
      : "kanban";
  });

  // Onboarding state: null = loading, true = show onboarding, false = done
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  // Tour phases: "splash" = full-screen welcome, "walkthrough" = overlay on dashboard, null = done
  const [tourPhase, setTourPhase] = useState<"splash" | "walkthrough" | null>(null);

  useEffect(() => {
    fetch(apiUrl("/api/onboarding"))
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) { setShowOnboarding(false); return; }
        const needsOnboarding = !data.done;
        setShowOnboarding(needsOnboarding);
        if (!needsOnboarding && !data.tourDone) setTourPhase("splash");
      })
      .catch(() => setShowOnboarding(false));
  }, []);

  function setActiveView(v: View) {
    localStorage.setItem("active-view", v);
    setActiveViewRaw(v);
  }

  // Show nothing while checking onboarding status
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

  if (showOnboarding) {
    return (
      <ThemeProvider>
        <OnboardingView onComplete={() => { setShowOnboarding(false); setTourPhase("splash"); }} />
      </ThemeProvider>
    );
  }

  // Full-screen welcome splash — shown BEFORE the dashboard
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
      <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg-primary)" }}>
        <Sidebar activeView={activeView} setActiveView={setActiveView} />
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
          {activeView === "chat" && <ChatView />}
          {activeView === "live" && <LiveView />}
          {activeView === "finance" && <FinanceView />}
          {activeView === "settings" && <SettingsView />}
        </main>
        {tourPhase === "walkthrough" && <WelcomeTour onDone={() => setTourPhase(null)} setActiveView={setActiveView} />}
      </div>
    </EmployeesProvider>
    </ThemeProvider>
  );
}
