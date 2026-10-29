"use client";
import { CloudOff, Check, Download, Inbox, Loader2, Menu, Moon, PanelRight, Search, Sparkles, TriangleAlert } from "lucide-react";
import { useWorkspace, type ViewName } from "../store";
import { loadDemoScenario } from "../actions";
import { exportEntitiesCsv, exportJson, exportRelationshipsCsv } from "../exporters";
import { toggleTheme } from "./theme";
import { IconButton, MenuItem, MenuSeparator, Popover, cn } from "../ui";

const VIEWS: Array<{ id: ViewName; label: string }> = [
  { id: "canvas", label: "اللوحة" },
  { id: "table", label: "الجدول" },
  { id: "dashboards", label: "لوحات المعلومات" },
  { id: "settings", label: "الإعدادات" },
];

function SyncBadge() {
  const state = useWorkspace((s) => s.syncState);
  const pending = useWorkspace((s) => s.pending);
  const map = {
    saved: { icon: <Check size={13} />, text: "محفوظ", cls: "text-[var(--fg-subtle)]" },
    saving: { icon: <Loader2 size={13} className="animate-spin" />, text: "جارٍ الحفظ…", cls: "text-[var(--fg-muted)]" },
    offline: { icon: <CloudOff size={13} />, text: `غير متصل · ${pending} تعديل محفوظ محلياً`, cls: "text-amber-600" },
    error: { icon: <TriangleAlert size={13} />, text: "خطأ في الحفظ", cls: "text-red-600" },
  }[state];
  return (
    <span className={cn("flex items-center gap-1 text-xs", map.cls)} data-testid="sync-state" data-state={state}>
      {map.icon}
      <span className="hidden sm:inline">{map.text}</span>
    </span>
  );
}

export function TopBar({ sidebarOpen, onToggleSidebar }: { sidebarOpen: boolean; onToggleSidebar: () => void }) {
  const view = useWorkspace((s) => s.view);
  const set = useWorkspace((s) => s.set);
  return (
    <header className="flex h-12 min-w-0 shrink-0 items-center gap-1 sm:gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-2">
      <IconButton label={sidebarOpen ? "إخفاء الشريط الجانبي" : "إظهار الشريط الجانبي"} onClick={onToggleSidebar}>
        <PanelRight size={17} />
      </IconButton>
      <span className="hidden px-1 font-bold tracking-wide sm:inline" dir="ltr">
        MINDSPACE
      </span>
      <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto sm:ms-2" aria-label="المناظير">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => set({ view: v.id })}
            className={cn(
              "whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm",
              view === v.id ? "bg-[var(--surface-2)] font-semibold text-[var(--fg)]" : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
            )}
          >
            {v.label}
          </button>
        ))}
      </nav>
      <div className="ms-auto flex shrink-0 items-center gap-1">
        <SyncBadge />
        <button
          type="button"
          onClick={() => set({ paletteOpen: true })}
          className="flex h-8 items-center gap-2 rounded-md border border-[var(--border)] px-2.5 text-sm text-[var(--fg-muted)] hover:bg-[var(--surface-2)]"
        >
          <Search size={14} /> <span className="hidden md:inline">بحث وأوامر</span>
          <kbd dir="ltr" className="hidden text-[10px] md:inline">
            Ctrl K
          </kbd>
        </button>
        <IconButton label="التقاط سريع" onClick={() => set({ captureOpen: true })}>
          <Inbox size={17} />
        </IconButton>
        <IconButton label="الوضع الليلي" className="hidden sm:inline-flex" onClick={toggleTheme}>
          <Moon size={17} />
        </IconButton>
        <Popover
          align="end"
          trigger={
            <IconButton label="المزيد">
              <Menu size={17} />
            </IconButton>
          }
        >
          {(close) => (
            <>
              <MenuItem icon={<Download size={14} />} onSelect={() => (close(), exportJson(useWorkspace.getState().snap))}>
                تصدير نسخة احتياطية (JSON)
              </MenuItem>
              <MenuItem icon={<Download size={14} />} onSelect={() => (close(), exportEntitiesCsv(useWorkspace.getState().snap))}>
                تصدير الكيانات (CSV)
              </MenuItem>
              <MenuItem icon={<Download size={14} />} onSelect={() => (close(), exportRelationshipsCsv(useWorkspace.getState().snap))}>
                تصدير العلاقات (CSV)
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Sparkles size={14} />} onSelect={() => (close(), loadDemoScenario())}>
                تحميل السيناريو التجريبي
              </MenuItem>
            </>
          )}
        </Popover>
      </div>
    </header>
  );
}
