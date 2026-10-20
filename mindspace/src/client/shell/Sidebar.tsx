"use client";
import { useMemo, useState } from "react";
import { Inbox, LayoutDashboard, Pencil, Plus, Trash2 } from "lucide-react";
import { useWorkspace } from "../store";
import { createCanvas } from "../actions";
import { EntityIcon } from "../icons";
import { Button, Dialog, IconButton, Input, cn } from "../ui";
import { ENTITY_DRAG_MIME } from "../canvas/CanvasView";

/** Navigation: canvases, plus the inbox of entities not placed on any canvas (drag them onto the board). */
export function Sidebar() {
  const canvases = useWorkspace((s) => s.snap.canvases);
  const placements = useWorkspace((s) => s.snap.placements);
  const entities = useWorkspace((s) => s.snap.entities);
  const entityTypes = useWorkspace((s) => s.snap.entityTypes);
  const activeCanvasId = useWorkspace((s) => s.activeCanvasId);
  const view = useWorkspace((s) => s.view);
  const set = useWorkspace((s) => s.set);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const sorted = useMemo(() => Object.values(canvases).sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)), [canvases]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of Object.values(placements)) m.set(p.canvasId, (m.get(p.canvasId) ?? 0) + 1);
    return m;
  }, [placements]);
  const unplaced = useMemo(() => {
    const placed = new Set(Object.values(placements).map((p) => p.entityId));
    return Object.values(entities)
      .filter((e) => !placed.has(e.id))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [entities, placements]);

  return (
    <nav className="flex h-full w-60 shrink-0 flex-col border-e border-[var(--border)] bg-[var(--surface)]" aria-label="التنقل">
      <div className="flex items-center justify-between px-3 pb-1 pt-3">
        <span className="text-xs font-semibold text-[var(--fg-muted)]">اللوحات</span>
        <IconButton label="لوحة جديدة" className="h-7 w-7" onClick={() => createCanvas(`لوحة ${sorted.length + 1}`)}>
          <Plus size={15} />
        </IconButton>
      </div>
      <ul className="ms-scroll max-h-[45%] overflow-auto px-2">
        {sorted.map((c) => (
          <li key={c.id} className="group">
            {renaming === c.id ? (
              <Input
                autoFocus
                defaultValue={c.name}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== c.name) useWorkspace.getState().dispatch([{ op: "update", kind: "canvas", id: c.id, patch: { name } }], { label: "إعادة تسمية لوحة" });
                  setRenaming(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setRenaming(null);
                }}
              />
            ) : (
              <div
                className={cn(
                  "flex items-center gap-1 rounded-md px-2 py-1.5 text-sm",
                  c.id === activeCanvasId && view === "canvas" ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "hover:bg-[var(--surface-2)]",
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-start"
                  onClick={() => set({ activeCanvasId: c.id, view: "canvas", focus: null, analysis: null, selectedNodes: [], selectedEdges: [] })}
                  onDoubleClick={() => setRenaming(c.id)}
                >
                  <LayoutDashboard size={14} className="shrink-0 opacity-70" />
                  <span className="truncate">{c.name}</span>
                </button>
                <span className="text-[10px] text-[var(--fg-subtle)] group-hover:hidden">{counts.get(c.id) ?? 0}</span>
                <span className="hidden gap-0.5 group-hover:flex">
                  <IconButton label="إعادة تسمية" className="h-6 w-6" onClick={() => setRenaming(c.id)}>
                    <Pencil size={12} />
                  </IconButton>
                  <IconButton label="حذف اللوحة" className="h-6 w-6" disabled={sorted.length < 2} onClick={() => setDeleting(c.id)}>
                    <Trash2 size={12} />
                  </IconButton>
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] px-3 pb-1 pt-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--fg-muted)]">
          <Inbox size={13} /> الوارد: غير موضوع في أي لوحة
        </span>
        <span className="text-[10px] text-[var(--fg-subtle)]">{unplaced.length}</span>
      </div>
      <ul className="ms-scroll min-h-0 flex-1 overflow-auto px-2 pb-3">
        {unplaced.length === 0 && <li className="px-2 py-1 text-xs text-[var(--fg-subtle)]">لا شيء هنا. الأفكار الملتقطة دون لوحة تظهر هنا.</li>}
        {unplaced.slice(0, 200).map((e) => {
          const t = entityTypes[e.typeId];
          return (
            <li key={e.id}>
              <button
                type="button"
                draggable
                onDragStart={(ev) => {
                  ev.dataTransfer.setData(ENTITY_DRAG_MIME, e.id);
                  ev.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => set({ inspected: { kind: "entity", id: e.id } })}
                className="flex w-full cursor-grab items-center gap-2 rounded-md px-2 py-1 text-start text-sm hover:bg-[var(--surface-2)]"
                title="اسحبه إلى اللوحة لوضعه فيها"
              >
                <EntityIcon name={t?.icon ?? "circle"} color={t?.color} size={13} />
                <span dir="auto" className="truncate">
                  {e.title || "بلا عنوان"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {deleting && (
        <Dialog open onOpenChange={(o) => !o && setDeleting(null)} title={`حذف اللوحة «${canvases[deleting]?.name}»؟`}>
          <p className="text-sm text-[var(--fg-muted)]">تُحذف اللوحة وترتيب بطاقاتها فقط. الكيانات والعلاقات تبقى في النظام، وتظهر في «الوارد» إن لم تكن في لوحة أخرى.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              إلغاء
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const st = useWorkspace.getState();
                const next = sorted.find((c) => c.id !== deleting);
                if (st.dispatch([{ op: "delete", kind: "canvas", id: deleting }], { label: "حذف لوحة" }) && st.activeCanvasId === deleting)
                  st.set({ activeCanvasId: next?.id ?? null });
                setDeleting(null);
              }}
            >
              حذف اللوحة
            </Button>
          </div>
        </Dialog>
      )}
    </nav>
  );
}
