"use client";
import { useWorkspace } from "../store";
import { Button, Dialog } from "../ui";

/** Explicit, informed confirmation before deleting entities from the whole system. */
export function ConfirmDeleteEntity({ entityIds, onConfirm, onCancel }: { entityIds: string[]; onConfirm: () => void; onCancel: () => void }) {
  const snap = useWorkspace((s) => s.snap);
  const ids = new Set(entityIds);
  const rels = Object.values(snap.relationships).filter((r) => ids.has(r.sourceId) || ids.has(r.targetId)).length;
  const placements = Object.values(snap.placements).filter((p) => ids.has(p.entityId));
  const canvases = new Set(placements.map((p) => p.canvasId)).size;
  const name = entityIds.length === 1 ? `«${snap.entities[entityIds[0]]?.title || "بلا عنوان"}»` : `${entityIds.length} كيانات`;
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()} title={`حذف ${name} من النظام؟`}>
      <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
        سيُحذف الكيان نفسه، ومعه <b>{rels}</b> علاقة، ويختفي من <b>{canvases}</b> لوحة. لإخفائه من لوحة واحدة فقط استعمل «إزالة من اللوحة» بدلاً من ذلك. يمكنك التراجع بـ Ctrl+Z.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          إلغاء
        </Button>
        <Button variant="danger" onClick={onConfirm} autoFocus>
          حذف نهائياً
        </Button>
      </div>
    </Dialog>
  );
}
