"use client";
import { useMemo, useState } from "react";
import { ArrowLeftRight, Check } from "lucide-react";
import { EDGE_CURVES, type RelationshipDirection } from "@/core/model";
import { useWorkspace } from "../store";
import { createRelationship } from "../actions";
import { Button, Input, cn } from "../ui";

export interface PickerRequest {
  sourceId: string;
  targetId: string;
  x: number;
  y: number;
  /** Called when the user cancels (e.g. to drop a card created for this link). */
  onCancel?: () => void;
}

const CURVE_LABEL: Record<(typeof EDGE_CURVES)[number], string> = { bezier: "منحني", straight: "مستقيم", step: "زوايا" };
const DIRECTION_LABEL: Record<RelationshipDirection, string> = { forward: "باتجاه واحد", both: "بالاتجاهين", none: "بلا اتجاه" };

/**
 * Small popup shown after dragging a line between two cards: choose the
 * relationship's meaning (type), name, direction and look. Saved immediately.
 */
export function RelationshipPicker({ req, onClose }: { req: PickerRequest; onClose: () => void }) {
  const types = useWorkspace((s) => s.snap.relationshipTypes);
  const entities = useWorkspace((s) => s.snap.entities);
  const sorted = useMemo(() => Object.values(types).sort((a, b) => a.sortOrder - b.sortOrder), [types]);
  const [typeId, setTypeId] = useState<string>(sorted[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [swap, setSwap] = useState(false);
  const [direction, setDirection] = useState<RelationshipDirection | null>(null);
  const [curve, setCurve] = useState<(typeof EDGE_CURVES)[number] | null>(null);

  const type = types[typeId];
  const sourceId = swap ? req.targetId : req.sourceId;
  const targetId = swap ? req.sourceId : req.targetId;
  const effectiveDirection = direction ?? (type?.directed === false ? "none" : "forward");

  const save = () => {
    if (!type) return;
    createRelationship({
      typeId,
      sourceId,
      targetId,
      label: label.trim(),
      direction: effectiveDirection,
      visual: curve && curve !== type.visual.curve ? { curve } : null,
    });
    onClose();
  };
  const cancel = () => {
    req.onCancel?.();
    onClose();
  };

  const left = Math.min(Math.max(req.x - 170, 12), (typeof window !== "undefined" ? window.innerWidth : 1200) - 352);
  const top = Math.min(Math.max(req.y - 40, 12), (typeof window !== "undefined" ? window.innerHeight : 800) - 470);

  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={cancel} />
      <div
        dir="rtl"
        role="dialog"
        aria-label="نوع العلاقة"
        className="fixed z-50 w-[340px] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-2xl"
        style={{ left, top }}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
          if (e.key === "Enter") save();
        }}
      >
        <div className="mb-2 flex items-center gap-1 text-sm">
          <span dir="auto" className="max-w-[40%] truncate font-semibold">{entities[sourceId]?.title || "بلا عنوان"}</span>
          <span className="text-[var(--fg-subtle)]">←</span>
          <span dir="auto" className="max-w-[40%] truncate font-semibold">{entities[targetId]?.title || "بلا عنوان"}</span>
          <button type="button" title="عكس الاتجاه" className="ms-auto rounded p-1 hover:bg-[var(--surface-2)]" onClick={() => setSwap(!swap)}>
            <ArrowLeftRight size={14} />
          </button>
        </div>
        <div className="ms-scroll mb-2 grid max-h-52 grid-cols-2 gap-1 overflow-auto">
          {sorted.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTypeId(t.id)}
              onDoubleClick={save}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-start text-xs",
                t.id === typeId ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-transparent hover:bg-[var(--surface-2)]",
              )}
            >
              <span className="h-0.5 w-4 shrink-0 rounded" style={{ background: t.visual.color }} />
              <span className="truncate">{t.name}</span>
              {t.id === typeId && <Check size={12} className="ms-auto shrink-0 text-[var(--accent)]" />}
            </button>
          ))}
        </div>
        <Input autoFocus placeholder={`اسم العلاقة (اختياري)، مثل: ${type?.name ?? ""}`} value={label} onChange={(e) => setLabel(e.target.value)} />
        <div className="mt-2 flex gap-1 text-[11px]">
          {(Object.keys(DIRECTION_LABEL) as RelationshipDirection[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              className={cn("flex-1 rounded-md border px-1 py-1", effectiveDirection === d ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)]")}
            >
              {DIRECTION_LABEL[d]}
            </button>
          ))}
        </div>
        <div className="mt-1 flex gap-1 text-[11px]">
          {EDGE_CURVES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurve(c)}
              className={cn(
                "flex-1 rounded-md border px-1 py-1",
                (curve ?? type?.visual.curve) === c ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)]",
              )}
            >
              {CURVE_LABEL[c]}
            </button>
          ))}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={cancel}>
            إلغاء
          </Button>
          <Button variant="primary" size="sm" onClick={save} disabled={!type}>
            حفظ العلاقة
          </Button>
        </div>
      </div>
    </>
  );
}
