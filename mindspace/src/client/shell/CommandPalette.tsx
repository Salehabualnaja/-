"use client";
import { useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { FileDown, Inbox, LayoutDashboard, Moon, Plus, Search, Settings, Sparkles, Table2 } from "lucide-react";
import { searchEntities } from "@/core/search";
import { cameraTo, useWorkspace } from "../store";
import { createCanvas, createEntityAt, loadDemoScenario, placementOf, viewCenter } from "../actions";
import { EntityIcon } from "../icons";
import { exportJson } from "../exporters";
import { toggleTheme } from "./theme";
import { cn } from "../ui";

interface Item {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

/** Ctrl+K: search entities (the camera flies to them) and run commands. */
export function CommandPalette() {
  const open = useWorkspace((s) => s.paletteOpen);
  const snap = useWorkspace((s) => s.snap);
  const set = useWorkspace((s) => s.set);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const close = () => {
    set({ paletteOpen: false });
    setQ("");
    setActive(0);
  };

  const items: Item[] = useMemo(() => {
    const st = useWorkspace.getState;
    const goToEntity = (id: string) => {
      const s = st();
      const here = placementOf(id, s.activeCanvasId);
      const anywhere = here ?? Object.values(s.snap.placements).find((p) => p.entityId === id);
      if (anywhere)
        s.set({
          view: "canvas",
          activeCanvasId: anywhere.canvasId,
          selectedNodes: [anywhere.id],
          selectedEdges: [],
          inspected: { kind: "entity", id },
          focus: null,
          cameraRequest: cameraTo([anywhere.id]),
        });
      else s.set({ inspected: { kind: "entity", id } });
    };
    const entityItems: Item[] = searchEntities(snap, q, 12).map(({ entity }) => {
      const t = snap.entityTypes[entity.typeId];
      const placed = Object.values(snap.placements).some((p) => p.entityId === entity.id);
      return {
        id: entity.id,
        label: entity.title || "بلا عنوان",
        hint: `${t?.name ?? ""}${placed ? "" : " · غير موضوع في لوحة"}`,
        icon: <EntityIcon name={t?.icon ?? "circle"} color={t?.color} size={15} />,
        run: () => goToEntity(entity.id),
      };
    });
    const commands: Item[] = [
      { id: "cmd-capture", label: "التقاط سريع للأفكار", icon: <Inbox size={15} />, run: () => set({ captureOpen: true }) },
      { id: "cmd-canvas", label: "لوحة جديدة", icon: <Plus size={15} />, run: () => createCanvas("لوحة جديدة") },
      { id: "cmd-table", label: "عرض الجدول", icon: <Table2 size={15} />, run: () => set({ view: "table" }) },
      { id: "cmd-dash", label: "لوحات المعلومات", icon: <LayoutDashboard size={15} />, run: () => set({ view: "dashboards" }) },
      { id: "cmd-settings", label: "الإعدادات: الأنواع والحقول", icon: <Settings size={15} />, run: () => set({ view: "settings" }) },
      { id: "cmd-theme", label: "تبديل الوضع الليلي", icon: <Moon size={15} />, run: toggleTheme },
      { id: "cmd-export", label: "تصدير نسخة احتياطية JSON", icon: <FileDown size={15} />, run: () => exportJson(st().snap) },
      { id: "cmd-demo", label: "تحميل السيناريو التجريبي", icon: <Sparkles size={15} />, run: loadDemoScenario },
    ];
    const qn = q.trim();
    const cmds = qn ? commands.filter((c) => c.label.includes(qn)) : commands;
    return [...entityItems, ...cmds];
  }, [snap, q, set]);

  const runAt = (i: number) => {
    const it = items[i];
    if (!it) return;
    close();
    it.run();
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => (o ? set({ paletteOpen: true }) : close())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <DialogPrimitive.Content dir="rtl" className="fixed left-1/2 top-[14vh] z-50 w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
          <DialogPrimitive.Title className="sr-only">البحث والأوامر</DialogPrimitive.Title>
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-3">
            <Search size={16} className="text-[var(--fg-subtle)]" />
            <input
              autoFocus
              dir="auto"
              value={q}
              placeholder="ابحث عن كيان أو أمر…"
              className="h-12 flex-1 bg-transparent text-sm outline-none"
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  setActive((a) => Math.min(a + 1, items.length - 1));
                  e.preventDefault();
                } else if (e.key === "ArrowUp") {
                  setActive((a) => Math.max(a - 1, 0));
                  e.preventDefault();
                } else if (e.key === "Enter") runAt(active);
              }}
            />
          </div>
          <ul className="ms-scroll max-h-[50vh] overflow-auto p-1.5" role="listbox">
            {items.length === 0 && <li className="p-3 text-sm text-[var(--fg-muted)]">لا نتائج.</li>}
            {items.map((it, i) => (
              <li key={it.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => runAt(i)}
                  className={cn("flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-start text-sm", i === active && "bg-[var(--surface-2)]")}
                >
                  {it.icon}
                  <span dir="auto" className="truncate">
                    {it.label}
                  </span>
                  {it.hint && <span className="ms-auto shrink-0 text-xs text-[var(--fg-subtle)]">{it.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
          {q.trim() && (
            <div className="border-t border-[var(--border)] p-2">
              <button
                type="button"
                className="w-full rounded-md px-2.5 py-1.5 text-start text-xs text-[var(--fg-muted)] hover:bg-[var(--surface-2)]"
                onClick={() => {
                  const created = createEntityAt(viewCenter(), undefined, q.trim());
                  close();
                  if (created) useWorkspace.getState().set({ view: "canvas", selectedNodes: [created.placement.id], cameraRequest: cameraTo([created.placement.id]) });
                }}
              >
                + إنشاء فكرة باسم «{q.trim()}» في اللوحة الحالية
              </button>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
