"use client";
import { MousePointerClick, Spline, Sparkles } from "lucide-react";
import { loadDemoScenario } from "../actions";
import { useWorkspace } from "../store";
import { Button } from "../ui";

/** Shown on an empty canvas only. The board itself stays empty: no data is imposed. */
export function EmptyCanvasHint() {
  const hasDemo = useWorkspace((s) => Object.values(s.snap.canvases).some((c) => c.name.startsWith("سيناريو تجريبي")));
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="max-w-sm rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)]/80 p-6 text-center backdrop-blur">
        <div className="mb-3 text-lg font-bold">لوحة فارغة للتفكير</div>
        <ul className="space-y-2 text-start text-sm text-[var(--fg-muted)]">
          <li className="flex items-center gap-2">
            <MousePointerClick size={16} className="shrink-0 text-[var(--accent)]" /> انقر مرتين في أي مكان لإضافة فكرة.
          </li>
          <li className="flex items-center gap-2">
            <Spline size={16} className="shrink-0 text-[var(--accent)]" /> اسحب من حافة بطاقة إلى أخرى لإنشاء علاقة.
          </li>
          <li className="flex items-center gap-2">
            <Sparkles size={16} className="shrink-0 text-[var(--accent)]" /> Ctrl+K للبحث والأوامر.
          </li>
        </ul>
        {!hasDemo && (
          <Button variant="outline" size="sm" className="pointer-events-auto mt-4" onClick={loadDemoScenario}>
            تحميل السيناريو التجريبي في لوحة مستقلة
          </Button>
        )}
      </div>
    </div>
  );
}
