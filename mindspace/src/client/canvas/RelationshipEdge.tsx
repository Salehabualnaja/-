"use client";
import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  useInternalNode,
  useStore,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import { effectiveVisual } from "@/core/model";
import { useWorkspace } from "../store";
import { floatingEdgeParams, offsetCurve } from "./geometry";

export type RelationshipEdgeData = {
  relationshipId: string;
  parallelIndex: number;
  parallelCount: number;
  highlighted: boolean;
};
export type RelationshipEdgeT = Edge<RelationshipEdgeData, "relationship">;

const DASH: Record<string, string | undefined> = { solid: undefined, dashed: "7 5", dotted: "1.5 5" };

/**
 * A relationship drawn on the canvas. Meaning (type, direction, label) comes
 * from the Relationship record; look (colour, width, dash, curve) from the
 * type's default visual overlaid with the relationship's own visual override.
 */
export const RelationshipEdge = memo(function RelationshipEdge({
  id,
  source,
  target,
  data,
  selected,
  markerEnd,
  markerStart,
}: EdgeProps<RelationshipEdgeT>) {
  const rel = useWorkspace((s) => s.snap.relationships[data!.relationshipId]);
  const type = useWorkspace((s) => (rel ? s.snap.relationshipTypes[rel.typeId] : undefined));
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  // Semantic zoom: labels are unreadable when zoomed far out, so skip them.
  const zoomedOut = useStore((s) => s.transform[2] < 0.45);
  if (!rel || !sourceNode || !targetNode) return null;

  const v = effectiveVisual(rel, type);
  const { sx, sy, tx, ty, sourcePos, targetPos } = floatingEdgeParams(sourceNode, targetNode);
  const { parallelIndex = 0, parallelCount = 1, highlighted } = data!;

  let path: string;
  let labelX: number;
  let labelY: number;
  if (parallelCount > 1) {
    // Keep a consistent bow direction regardless of which end is the source.
    const flip = source < target ? 1 : -1;
    const offset = (parallelIndex - (parallelCount - 1) / 2) * 34 * flip;
    ({ path, labelX, labelY } = offsetCurve(sx, sy, tx, ty, offset));
  } else if (v.curve === "straight") {
    [path, labelX, labelY] = getStraightPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty });
  } else if (v.curve === "step") {
    [path, labelX, labelY] = getSmoothStepPath({
      sourceX: sx,
      sourceY: sy,
      sourcePosition: sourcePos,
      targetX: tx,
      targetY: ty,
      targetPosition: targetPos,
      borderRadius: 10,
    });
  } else {
    [path, labelX, labelY] = getBezierPath({
      sourceX: sx,
      sourceY: sy,
      sourcePosition: sourcePos,
      targetX: tx,
      targetY: ty,
      targetPosition: targetPos,
    });
  }

  const text = rel.label || (typeof rel.properties.role === "string" && rel.properties.role) || type?.name || "";
  const width = v.width * (highlighted ? 2 : 1) + (selected ? 1 : 0);

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        className="ms-edge-path"
        interactionWidth={18}
        style={{
          stroke: v.color,
          strokeWidth: width,
          strokeDasharray: DASH[v.dash],
          strokeLinecap: "round",
          opacity: v.opacity,
        }}
      />
      {v.showLabel && text && (!zoomedOut || selected || highlighted) && (
        <EdgeLabelRenderer>
          <div
            dir="auto"
            className="nodrag nopan pointer-events-auto absolute max-w-44 cursor-pointer truncate rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-sm"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: "var(--surface)",
              borderColor: selected ? "var(--accent)" : `${v.color}66`,
              color: v.color,
              opacity: Math.max(v.opacity, 0.6),
            }}
            onClick={() => useWorkspace.getState().set({ selectedEdges: [id], selectedNodes: [], inspected: { kind: "relationship", id: rel.id } })}
            title={type ? `${type.name}${rel.label ? ` — ${rel.label}` : ""}` : undefined}
          >
            {text}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
