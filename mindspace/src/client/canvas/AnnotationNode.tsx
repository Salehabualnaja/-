"use client";
import { memo, useEffect, useRef, useState } from "react";
import { NodeResizer, type Node, type NodeProps } from "@xyflow/react";
import { useWorkspace } from "../store";
import { cn } from "../ui";
import { focusWhenVisible } from "./EntityNode";

export type AnnotationNodeData = { annotationId: string };
export type AnnotationNodeT = Node<AnnotationNodeData, "annotation">;

/** Sticky notes, free text and frames: canvas-only content with no semantic meaning. */
export const AnnotationNode = memo(function AnnotationNode({ id, selected }: NodeProps<AnnotationNodeT>) {
  const a = useWorkspace((s) => s.snap.annotations[id]);
  const editing = useWorkspace((s) => s.editingNodeId === id);
  if (!a) return null;

  const resizer = (
    <NodeResizer
      isVisible={selected && !editing}
      minWidth={a.kind === "frame" ? 160 : 80}
      minHeight={a.kind === "text" ? 32 : 60}
      handleClassName="handle"
      onResizeEnd={(_, r) =>
        useWorkspace
          .getState()
          .dispatch([{ op: "update", kind: "annotation", id, patch: { x: r.x, y: r.y, width: r.width, height: r.height } }], { label: "تغيير الحجم" })
      }
    />
  );

  if (a.kind === "frame") {
    const color = a.style.color ?? "#94a3b8";
    return (
      <div
        className={cn("relative h-full w-full rounded-2xl border-2", selected && "ring-2 ring-[var(--accent)]")}
        style={{ borderColor: `${color}aa`, background: `${color}12` }}
      >
        {resizer}
        <div className="absolute -top-7 start-1 max-w-full">
          {editing ? (
            <TextEditor id={id} initial={a.text} className="h-6 rounded bg-[var(--surface)] px-1 text-sm font-semibold" single />
          ) : (
            <span dir="auto" className="truncate text-sm font-semibold" style={{ color }}>
              {a.text || "إطار"}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (a.kind === "text") {
    return (
      <div className={cn("h-full w-full rounded-md px-1", selected && "ring-2 ring-[var(--accent)]")} style={{ color: a.style.color }}>
        {resizer}
        {editing ? (
          <TextEditor id={id} initial={a.text} className="h-full w-full bg-transparent text-xl font-semibold" />
        ) : (
          <div dir="auto" className={cn("whitespace-pre-wrap text-xl font-semibold leading-snug", !a.text && "text-[var(--fg-subtle)]")}>
            {a.text || "نص"}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn("h-full w-full rounded-md p-3 text-[#3f3f1f] shadow-md", selected && "ring-2 ring-[var(--accent)]")}
      style={{ background: a.style.color ?? "#fef08a" }}
    >
      {resizer}
      {editing ? (
        <TextEditor id={id} initial={a.text} className="h-full w-full bg-transparent text-sm leading-relaxed" />
      ) : (
        <div dir="auto" className={cn("h-full overflow-hidden whitespace-pre-wrap text-sm leading-relaxed", !a.text && "opacity-50")}>
          {a.text || "ملاحظة لاصقة…"}
        </div>
      )}
    </div>
  );
});

function TextEditor({ id, initial, className, single }: { id: string; initial: string; className?: string; single?: boolean }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  const finished = useRef(false);
  useEffect(() => focusWhenVisible(ref.current), []);
  const done = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const st = useWorkspace.getState();
    st.set({ editingNodeId: null });
    if (save && value !== initial) st.dispatch([{ op: "update", kind: "annotation", id, patch: { text: value } }], { label: "تعديل نص" });
  };
  return (
    <textarea
      ref={ref}
      dir="auto"
      value={value}
      rows={single ? 1 : undefined}
      className={cn("nodrag nowheel resize-none outline-none", className)}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => done(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") done(false);
        if (e.key === "Enter" && (single || e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          done(true);
        }
      }}
    />
  );
}
