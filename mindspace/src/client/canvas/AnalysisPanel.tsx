"use client";
import { X } from "lucide-react";
import { useWorkspace } from "../store";
import { placementOf } from "../actions";
import { IconButton } from "../ui";

/** Result of an analysis (impact, path), with the relationships each row rests on. */
export function AnalysisPanel() {
  const analysis = useWorkspace((s) => s.analysis);
  const entities = useWorkspace((s) => s.snap.entities);
  const canvasId = useWorkspace((s) => s.activeCanvasId);
  const set = useWorkspace((s) => s.set);
  if (!analysis) return null;

  const missing = analysis.entityIds.filter((id) => !placementOf(id, canvasId)).length;
  return (
    <div className="absolute left-3 top-16 z-10 w-80 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl">
      <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <div>
          <div className="text-sm font-semibold">{analysis.title}</div>
          <div className="text-[11px] text-[var(--fg-muted)]">
            نتيجة مشتقة من العلاقات المسجّلة · {analysis.rows.length} عنصر
            {missing > 0 && ` · ${missing} غير ظاهر في هذه اللوحة`}
          </div>
        </div>
        <IconButton label="إغلاق التحليل" onClick={() => set({ analysis: null })}>
          <X size={15} />
        </IconButton>
      </div>
      <ul className="ms-scroll max-h-72 overflow-auto p-2 text-xs">
        {analysis.rows.length === 0 && <li className="p-2 text-[var(--fg-muted)]">لا شيء يتأثر وفق العلاقات المسجّلة.</li>}
        {analysis.rows.map((r, i) => (
          <li key={i} className="rounded-md p-2 hover:bg-[var(--surface-2)]">
            {r.entityId && (
              <button
                type="button"
                className="mb-0.5 block font-semibold hover:text-[var(--accent)]"
                dir="auto"
                onClick={() => set({ inspected: { kind: "entity", id: r.entityId } })}
              >
                {entities[r.entityId]?.title || "بلا عنوان"}
              </button>
            )}
            <div dir="auto" className="leading-relaxed text-[var(--fg-muted)]">
              {r.detail}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
