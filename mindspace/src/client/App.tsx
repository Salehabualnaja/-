"use client";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { installUnloadGuard, useWorkspace } from "./store";
import { TopBar } from "./shell/TopBar";
import { Sidebar } from "./shell/Sidebar";
import { InspectorPanel } from "./shell/InspectorPanel";
import { CommandPalette } from "./shell/CommandPalette";
import { QuickCapture } from "./shell/QuickCapture";
import { Toasts } from "./shell/Toasts";
import { NewTypeDialog } from "./canvas/NewTypeDialog";
import { CanvasView } from "./canvas/CanvasView";
import { TableView } from "./views/TableView";
import { DashboardsView } from "./views/DashboardsView";
import { SettingsView } from "./views/SettingsView";
import { Button } from "./ui";

const queryClient = new QueryClient();

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

export function App() {
  const status = useWorkspace((s) => s.status);
  const loadError = useWorkspace((s) => s.loadError);
  const view = useWorkspace((s) => s.view);
  const offlineStart = useWorkspace((s) => s.offlineStart);
  // Sidebar starts hidden on phones, where it opens as an overlay.
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 768);

  useEffect(() => {
    void useWorkspace.getState().load();
    return installUnloadGuard();
  }, []);

  // Global shortcuts (canvas-specific ones live in CanvasView).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useWorkspace.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        st.set({ paletteOpen: !st.paletteOpen });
        return;
      }
      if (isTyping(e)) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        st.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (status === "loading")
    return <div className="flex h-dvh items-center justify-center text-sm text-[var(--fg-muted)]">جارٍ تحميل مساحة التفكير…</div>;
  if (status === "error")
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="font-semibold">تعذّر تحميل البيانات</div>
        <div className="text-sm text-[var(--fg-muted)]">{loadError}</div>
        <Button variant="primary" onClick={() => void useWorkspace.getState().load()}>
          إعادة المحاولة
        </Button>
      </div>
    );

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-dvh flex-col overflow-hidden">
        <TopBar sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        {offlineStart && (
          <div className="bg-amber-500/15 px-3 py-1 text-center text-xs text-amber-700 dark:text-amber-300">
            تعمل الآن من نسخة محلية لأن الخادم غير متاح. تعديلاتك محفوظة في المتصفح وتُرسل تلقائياً عند عودة الاتصال.
          </div>
        )}
        <div className="relative flex min-h-0 flex-1">
          {sidebarOpen && (
            <>
              <div className="absolute inset-0 z-20 bg-black/30 md:hidden" onClick={() => setSidebarOpen(false)} />
              <div className="absolute inset-y-0 start-0 z-30 shadow-xl md:static md:z-auto md:shadow-none">
                <Sidebar />
              </div>
            </>
          )}
          <main className="relative min-w-0 flex-1">
            {view === "canvas" && <CanvasView />}
            {view === "table" && <TableView />}
            {view === "dashboards" && <DashboardsView />}
            {view === "settings" && <SettingsView />}
          </main>
          <InspectorPanel />
        </div>
      </div>
      <CommandPalette />
      <QuickCapture />
      <NewTypeDialog />
      <Toasts />
    </QueryClientProvider>
  );
}
