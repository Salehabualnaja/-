"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Handle, NodeResizer, Position, useStore, type Node, type NodeProps, type ReactFlowState } from "@xyflow/react";
import { CalendarDays, Link2 } from "lucide-react";
import { formatFieldValue } from "@/core/fields";
import { nowIso } from "@/core/model";
import { useWorkspace } from "../store";
import { EntityIcon } from "../icons";
import { cn } from "../ui";

export type EntityNodeData = { entityId: string; degree: number };
export type EntityNodeT = Node<EntityNodeData, "entity">;

/** Semantic zoom level, bucketed so cards re-render only when crossing a threshold. */
export type Lod = "overview" | "normal" | "detail";
export const lodSelector = (s: ReactFlowState): Lod => {
  const z = s.transform[2];
  return z < 0.45 ? "overview" : z < 0.9 ? "normal" : "detail";
};

const HANDLES = [Position.Top, Position.Right, Position.Bottom, Position.Left];

export const EntityNode = memo(function EntityNode({ id, data, selected }: NodeProps<EntityNodeT>) {
  const entity = useWorkspace((s) => s.snap.entities[data.entityId]);
  const type = useWorkspace((s) => (entity ? s.snap.entityTypes[entity.typeId] : undefined));
  const style = useWorkspace((s) => s.snap.placements[id]?.style);
  const allFields = useWorkspace((s) => s.snap.fields);
  const statuses = useWorkspace((s) => s.snap.workspace.settings.statuses);
  const editing = useWorkspace((s) => s.editingNodeId === id);
  const lod = useStore(lodSelector);

  const fields = useMemo(
    () =>
      entity
        ? Object.values(allFields)
            .filter((f) => f.entityTypeId === entity.typeId)
            .sort((a, b) => a.sortOrder - b.sortOrder)
        : [],
    [allFields, entity],
  );

  if (!entity) return null;
  const color = style?.color ?? type?.color ?? "#64748b";
  const status = statuses.find((s) => s.value === entity.status);
  const variant = style?.variant ?? "card";
  const title = entity.title || "بلا عنوان";

  const handles = HANDLES.map((p) => (
    <Handle key={p} id={p} type="source" position={p} className="ms-handle" isConnectable={lod !== "overview"} />
  ));

  if (lod === "overview") {
    return (
      <div
        className={cn("flex h-full min-h-14 items-center rounded-2xl px-4 py-3 shadow", selected && "ring-4 ring-[var(--accent)]")}
        style={{ background: color }}
      >
        {handles}
        <div dir="auto" className="line-clamp-2 w-full text-3xl font-bold leading-tight text-white">
          {title}
        </div>
      </div>
    );
  }

  const shownFields =
    lod === "detail"
      ? fields
          .map((f) => ({ f, v: formatFieldValue(entity.properties[f.key], f) }))
          .filter((x) => x.v)
          .slice(0, 4)
      : [];

  return (
    <div
      className={cn(
        "group relative flex h-full flex-col rounded-xl border bg-[var(--card)] text-[var(--fg)] transition-shadow",
        variant === "pill" && "rounded-full px-2",
        selected ? "border-[var(--accent)] shadow-lg ring-2 ring-[var(--accent-soft)]" : "border-[var(--border)]",
      )}
      style={{
        boxShadow: selected ? undefined : "var(--shadow)",
        background: variant === "note" ? `${color}1f` : undefined,
      }}
    >
      <NodeResizer
        isVisible={selected && !editing}
        minWidth={150}
        minHeight={56}
        handleClassName="handle"
        onResizeEnd={(_, r) =>
          useWorkspace
            .getState()
            .dispatch([{ op: "update", kind: "placement", id, patch: { x: r.x, y: r.y, width: r.width, height: r.height } }], { label: "تغيير الحجم" })
        }
      />
      {handles}
      {variant === "card" && <div className="h-1 rounded-t-xl" style={{ background: color }} />}
      <div className="flex min-h-0 flex-1 flex-col gap-1 px-3 py-2">
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--fg-muted)]">
          <EntityIcon name={type?.icon ?? "circle"} size={13} color={color} />
          <span className="truncate">{type?.name}</span>
          {status && (
            <span className="ms-auto inline-flex items-center gap-1 rounded-full px-1.5 py-px" style={{ background: `${status.color}26`, color: status.color }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: status.color }} />
              {status.label}
            </span>
          )}
        </div>
        {editing ? (
          <TitleEditor entityId={entity.id} nodeId={id} initial={entity.title} />
        ) : (
          <div dir="auto" className={cn("line-clamp-3 text-[15px] font-bold leading-snug", !entity.title && "text-[var(--fg-subtle)]")}>
            {title}
          </div>
        )}
        {lod === "detail" && entity.description && (
          <p dir="auto" className="line-clamp-3 text-xs leading-relaxed text-[var(--fg-muted)]">
            {entity.description}
          </p>
        )}
        {shownFields.length > 0 && (
          <dl className="mt-0.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
            {shownFields.map(({ f, v }) => (
              <div key={f.id} className="contents">
                <dt className="text-[var(--fg-subtle)]">{f.label}</dt>
                <dd dir="auto" className="truncate">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {lod === "detail" && (entity.tags.length > 0 || entity.dueDate || data.degree > 0) && (
          <div className="mt-auto flex flex-wrap items-center gap-1 pt-1 text-[10px] text-[var(--fg-muted)]">
            {entity.tags.slice(0, 3).map((t) => (
              <span key={t} className="rounded bg-[var(--surface-2)] px-1.5 py-px">
                #{t}
              </span>
            ))}
            {entity.dueDate && (
              <span className="inline-flex items-center gap-0.5" dir="ltr">
                <CalendarDays size={11} /> {entity.dueDate}
              </span>
            )}
            {data.degree > 0 && (
              <span className="ms-auto inline-flex items-center gap-0.5" title="عدد العلاقات">
                <Link2 size={11} /> {data.degree}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * React Flow keeps a new node invisible until it has been measured, and
 * focus() on an invisible element is ignored, so retry for a few frames.
 */
export function focusWhenVisible(el: HTMLTextAreaElement | null, select = false) {
  let tries = 0;
  let frame = 0;
  const attempt = () => {
    if (!el) return;
    el.focus();
    if (document.activeElement === el) {
      if (select) el.select();
      return;
    }
    if (tries++ < 30) frame = requestAnimationFrame(attempt);
  };
  attempt();
  return () => cancelAnimationFrame(frame);
}

function TitleEditor({ entityId, nodeId, initial }: { entityId: string; nodeId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  const finished = useRef(false);
  useEffect(() => focusWhenVisible(ref.current, true), []);
  const done = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const st = useWorkspace.getState();
    if (st.editingNodeId === nodeId) st.set({ editingNodeId: null });
    const title = value.trim();
    if (save && title !== initial)
      st.dispatch([{ op: "update", kind: "entity", id: entityId, patch: { title, updatedAt: nowIso() } }], { label: "تعديل العنوان" });
  };
  return (
    <textarea
      ref={ref}
      dir="auto"
      rows={2}
      value={value}
      placeholder="اكتب الفكرة…"
      className="nodrag nowheel w-full resize-none rounded-md bg-[var(--surface-2)] px-1.5 py-1 text-[15px] font-bold leading-snug outline-none ring-2 ring-[var(--accent-soft)]"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => done(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          done(true);
        } else if (e.key === "Escape") {
          done(false);
        }
      }}
    />
  );
}
