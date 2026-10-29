"use client";
import { useEffect, useRef, useState } from "react";
import { ClipboardPaste, Copy, Plus, Crosshair, Eye, Frame, Layers, Palette, StickyNote, Trash2, Type, Unlink, X, Zap } from "lucide-react";
import type { Op } from "@/core/ops";
import { useWorkspace } from "../store";
import {
  copySelection,
  createAnnotationAt,
  createEntityAt,
  deleteEntities,
  deleteRelationships,
  duplicateSelection,
  hasClipboard,
  paste,
  removeFromCanvas,
  runImpactAnalysis,
} from "../actions";
import { EntityIcon, PALETTE, STICKY_COLORS } from "../icons";
import { MenuItem, MenuSeparator, Swatches } from "../ui";
import { ConfirmDeleteEntity } from "../inspector/ConfirmDeleteEntity";

export interface MenuRequest {
  kind: "pane" | "node" | "edge";
  id?: string;
  x: number;
  y: number;
  flow: { x: number; y: number };
}

export function ContextMenu({ req, onClose }: { req: MenuRequest; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [sub, setSub] = useState<"types" | "color" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const snap = useWorkspace((s) => s.snap);
  const st = useWorkspace.getState;

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  const left = Math.min(req.x, window.innerWidth - 240);
  const top = Math.min(req.y, window.innerHeight - 380);
  const placement = req.id ? snap.placements[req.id] : undefined;
  const annotation = req.id ? snap.annotations[req.id] : undefined;
  const selectedEntityIds = st()
    .selectedNodes.map((id) => snap.placements[id]?.entityId)
    .filter((x): x is string => !!x);

  if (confirmDelete)
    return (
      <ConfirmDeleteEntity
        entityIds={confirmDelete}
        onCancel={onClose}
        onConfirm={() => {
          deleteEntities(confirmDelete);
          onClose();
        }}
      />
    );

  return (
    <div ref={ref} dir="rtl" className="fixed z-50 w-56 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5 text-sm shadow-xl" style={{ left, top }}>
      {req.kind === "pane" &&
        (sub === "types" ? (
          <div className="ms-scroll max-h-80 overflow-auto">
            {Object.values(snap.entityTypes)
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((t) => (
                <MenuItem
                  key={t.id}
                  icon={<EntityIcon name={t.icon} size={14} color={t.color} />}
                  onSelect={run(() => {
                    const c = createEntityAt(req.flow, t.id);
                    if (c) st().set({ editingNodeId: c.placement.id, selectedNodes: [c.placement.id] });
                  })}
                >
                  {t.name}
                </MenuItem>
              ))}
            <MenuSeparator />
            <MenuItem icon={<Plus size={14} />} onSelect={run(() => st().set({ newTypeAt: req.flow }))}>
              أخرى… (صنف تحدّده أنت)
            </MenuItem>
          </div>
        ) : (
          <>
            <MenuItem icon={<Layers size={14} />} onSelect={() => setSub("types")}>
              كيان جديد هنا…
            </MenuItem>
            <MenuItem icon={<StickyNote size={14} />} onSelect={run(() => createAnnotationAt("sticky", req.flow))}>
              ملاحظة لاصقة
            </MenuItem>
            <MenuItem icon={<Type size={14} />} onSelect={run(() => createAnnotationAt("text", req.flow))}>
              نص
            </MenuItem>
            <MenuItem icon={<Frame size={14} />} onSelect={run(() => createAnnotationAt("frame", req.flow))}>
              إطار
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<ClipboardPaste size={14} />} disabled={!hasClipboard()} shortcut="Ctrl+V" onSelect={run(() => paste(req.flow))}>
              لصق
            </MenuItem>
            <MenuItem icon={<Copy size={14} />} disabled={!hasClipboard()} shortcut="Ctrl+Shift+V" onSelect={run(() => paste(req.flow, true))}>
              لصق كنسخة جديدة
            </MenuItem>
          </>
        ))}

      {req.kind === "node" &&
        (sub === "color" ? (
          <div className="p-1.5">
            <Swatches
              allowNone={!!placement}
              colors={annotation && annotation.kind === "sticky" ? STICKY_COLORS : PALETTE}
              value={placement?.style.color ?? annotation?.style.color}
              onChange={(color) =>
                run(() => {
                  const ids = st().selectedNodes.length ? st().selectedNodes : [req.id!];
                  const ops: Op[] = ids.flatMap((id): Op[] => {
                    const p = snap.placements[id];
                    const a = snap.annotations[id];
                    if (p) return [{ op: "update" as const, kind: "placement" as const, id, patch: { style: { ...p.style, color } } }];
                    if (a) return [{ op: "update" as const, kind: "annotation" as const, id, patch: { style: { ...a.style, color } } }];
                    return [];
                  });
                  st().dispatch(ops, { label: "تغيير اللون" });
                })()
              }
            />
            <p className="mt-2 text-[11px] text-[var(--fg-subtle)]">اللون مظهر البطاقة في هذه اللوحة فقط، ولا يغيّر نوع الكيان.</p>
          </div>
        ) : (
          <>
            {placement && (
              <>
                <MenuItem icon={<Eye size={14} />} onSelect={run(() => st().set({ inspected: { kind: "entity", id: placement.entityId } }))}>
                  فتح التفاصيل
                </MenuItem>
                <MenuItem icon={<Crosshair size={14} />} onSelect={run(() => st().set({ focus: { entityId: placement.entityId, depth: 1 } }))}>
                  وضع التركيز
                </MenuItem>
                <MenuItem icon={<Zap size={14} />} onSelect={run(() => runImpactAnalysis(placement.entityId))}>
                  تحليل الأثر
                </MenuItem>
                <MenuSeparator />
              </>
            )}
            <MenuItem icon={<Palette size={14} />} onSelect={() => setSub("color")}>
              اللون…
            </MenuItem>
            <MenuItem icon={<Copy size={14} />} shortcut="Ctrl+C" onSelect={run(() => copySelection())}>
              نسخ
            </MenuItem>
            <MenuItem icon={<Layers size={14} />} shortcut="Ctrl+D" onSelect={run(() => duplicateSelection())}>
              تكرار
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<X size={14} />} shortcut="Del" onSelect={run(() => removeFromCanvas(st().selectedNodes.length ? st().selectedNodes : [req.id!]))}>
              إزالة من اللوحة
            </MenuItem>
            {selectedEntityIds.length > 0 && (
              <MenuItem danger icon={<Trash2 size={14} />} onSelect={() => setConfirmDelete(selectedEntityIds)}>
                حذف من النظام نهائياً…
              </MenuItem>
            )}
          </>
        ))}

      {req.kind === "edge" && req.id && (
        <>
          <MenuItem icon={<Eye size={14} />} onSelect={run(() => st().set({ inspected: { kind: "relationship", id: req.id! } }))}>
            تفاصيل العلاقة
          </MenuItem>
          <MenuItem danger icon={<Unlink size={14} />} shortcut="Del" onSelect={run(() => deleteRelationships([req.id!]))}>
            حذف العلاقة
          </MenuItem>
        </>
      )}
    </div>
  );
}
