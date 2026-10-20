"use client";
import { useWorkspace } from "../store";
import { EntityInspector } from "../inspector/EntityInspector";
import { RelationshipInspector } from "../inspector/RelationshipInspector";

/** Detail panel for the selected entity or relationship (at the inline end: left in RTL). */
export function InspectorPanel() {
  const inspected = useWorkspace((s) => s.inspected);
  if (!inspected) return null;
  return (
    <aside
      aria-label="التفاصيل"
      className="ms-scroll absolute inset-y-0 end-0 z-20 w-[340px] max-w-full overflow-y-auto border-s border-[var(--border)] bg-[var(--surface)] shadow-xl md:static md:z-auto md:shadow-none"
      data-testid="inspector"
    >
      {inspected.kind === "entity" ? <EntityInspector key={inspected.id} id={inspected.id} /> : <RelationshipInspector key={inspected.id} id={inspected.id} />}
    </aside>
  );
}
