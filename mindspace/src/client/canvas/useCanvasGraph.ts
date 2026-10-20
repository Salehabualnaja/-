"use client";
/**
 * Projects the knowledge graph onto one canvas: placements -> nodes,
 * relationships between placed entities -> edges, honouring filters, focus
 * mode and analysis highlighting.
 */
import { useMemo } from "react";
import { MarkerType, type Edge, type Node } from "@xyflow/react";
import { effectiveVisual } from "@/core/model";
import { buildAdjacency, neighborhood } from "@/core/graph";
import { useWorkspace } from "../store";
import type { EntityNodeT } from "./EntityNode";
import type { AnnotationNodeT } from "./AnnotationNode";
import type { RelationshipEdgeT } from "./RelationshipEdge";

export type CanvasNode = EntityNodeT | AnnotationNodeT;

/** True when two node objects would render identically (lets callers keep the old object). */
export function sameNode(a: CanvasNode, b: CanvasNode): boolean {
  return (
    a.position.x === b.position.x &&
    a.position.y === b.position.y &&
    a.selected === b.selected &&
    a.hidden === b.hidden &&
    a.className === b.className &&
    a.zIndex === b.zIndex &&
    a.width === b.width &&
    a.height === b.height &&
    (a.data as Record<string, unknown>).degree === (b.data as Record<string, unknown>).degree
  );
}

type MarkerLike = { type?: string; color?: string | null } | string | undefined;
const sameMarker = (a: MarkerLike, b: MarkerLike) =>
  a === b || (typeof a === "object" && typeof b === "object" && a.type === b.type && a.color === b.color);

/** True when two edge objects would render identically. */
export function sameEdge(a: Edge, b: Edge): boolean {
  const da = a.data as RelationshipEdgeT["data"];
  const db = b.data as RelationshipEdgeT["data"];
  return (
    a.source === b.source &&
    a.target === b.target &&
    a.selected === b.selected &&
    a.className === b.className &&
    a.zIndex === b.zIndex &&
    sameMarker(a.markerEnd as MarkerLike, b.markerEnd as MarkerLike) &&
    sameMarker(a.markerStart as MarkerLike, b.markerStart as MarkerLike) &&
    da?.parallelIndex === db?.parallelIndex &&
    da?.parallelCount === db?.parallelCount &&
    da?.highlighted === db?.highlighted
  );
}

export function useCanvasGraph(canvasId: string) {
  const placements = useWorkspace((s) => s.snap.placements);
  const annotations = useWorkspace((s) => s.snap.annotations);
  const entities = useWorkspace((s) => s.snap.entities);
  const relationships = useWorkspace((s) => s.snap.relationships);
  const relTypes = useWorkspace((s) => s.snap.relationshipTypes);
  const selectedNodes = useWorkspace((s) => s.selectedNodes);
  const selectedEdges = useWorkspace((s) => s.selectedEdges);
  const focus = useWorkspace((s) => s.focus);
  const filters = useWorkspace((s) => s.filters);
  const analysis = useWorkspace((s) => s.analysis);

  const onCanvas = useMemo(() => Object.values(placements).filter((p) => p.canvasId === canvasId), [placements, canvasId]);
  const canvasAnnotations = useMemo(() => Object.values(annotations).filter((a) => a.canvasId === canvasId), [annotations, canvasId]);

  const adjacency = useMemo(() => buildAdjacency(Object.values(relationships)), [relationships]);

  const visibleRelTypes = useMemo(() => {
    const hidden = new Set(filters.hiddenRelationshipTypes);
    return new Set(Object.keys(relTypes).filter((id) => !hidden.has(id)));
  }, [relTypes, filters.hiddenRelationshipTypes]);

  /** Entities allowed by focus mode (null = no focus). */
  const focusSet = useMemo(() => {
    if (!focus || !entities[focus.entityId]) return null;
    return neighborhood(adjacency, [focus.entityId], focus.depth, { typeIds: visibleRelTypes }).entities;
  }, [focus, adjacency, visibleRelTypes, entities]);

  const result = useMemo(() => {
    const hiddenTypes = new Set(filters.hiddenEntityTypes);
    const selN = new Set(selectedNodes);
    const selE = new Set(selectedEdges);
    const highlightN = analysis ? new Set(analysis.entityIds) : null;
    const highlightE = analysis ? new Set(analysis.relationshipIds) : null;

    const entityToNode = new Map<string, string>();
    const visibleEntity = new Set<string>();
    for (const p of onCanvas) {
      entityToNode.set(p.entityId, p.id);
      const e = entities[p.entityId];
      if (!e || hiddenTypes.has(e.typeId) || (focusSet && !focusSet.has(p.entityId))) continue;
      visibleEntity.add(p.entityId);
    }

    // Edges between visible placed entities.
    const degree = new Map<string, number>();
    const pairs = new Map<string, string[]>();
    const edgeRels = [];
    for (const r of Object.values(relationships)) {
      degree.set(r.sourceId, (degree.get(r.sourceId) ?? 0) + 1);
      degree.set(r.targetId, (degree.get(r.targetId) ?? 0) + 1);
      if (!visibleRelTypes.has(r.typeId) || r.sourceId === r.targetId) continue;
      if (!visibleEntity.has(r.sourceId) || !visibleEntity.has(r.targetId)) continue;
      const key = r.sourceId < r.targetId ? `${r.sourceId}|${r.targetId}` : `${r.targetId}|${r.sourceId}`;
      pairs.set(key, [...(pairs.get(key) ?? []), r.id]);
      edgeRels.push({ r, key });
    }

    const edges: RelationshipEdgeT[] = edgeRels.map(({ r, key }) => {
      const group = pairs.get(key)!;
      const v = effectiveVisual(r, relTypes[r.typeId]);
      const marker =
        v.arrow === "none" ? undefined : { type: v.arrow === "arrow" ? MarkerType.Arrow : MarkerType.ArrowClosed, color: v.color, width: 16, height: 16 };
      const highlighted = !!highlightE?.has(r.id);
      return {
        id: r.id,
        type: "relationship",
        source: entityToNode.get(r.sourceId)!,
        target: entityToNode.get(r.targetId)!,
        selected: selE.has(r.id),
        markerEnd: r.direction === "none" ? undefined : marker,
        markerStart: r.direction === "both" ? marker : undefined,
        className: highlightE && !highlighted ? "dimmed" : undefined,
        zIndex: highlighted ? 5 : 0,
        data: { relationshipId: r.id, parallelIndex: group.indexOf(r.id), parallelCount: group.length, highlighted },
      };
    });

    const nodes: CanvasNode[] = [];
    const push = (n: CanvasNode) => nodes.push(n);

    // Frames first so they render beneath cards.
    for (const a of [...canvasAnnotations].sort((x, y) => x.z - y.z)) {
      push({
        id: a.id,
        type: "annotation",
        position: { x: a.x, y: a.y },
        width: a.width,
        height: a.height,
        zIndex: a.kind === "frame" ? -1 : a.z,
        selected: selN.has(a.id),
        hidden: !!focusSet,
        className: highlightN ? "dimmed" : undefined,
        dragHandle: undefined,
        data: { annotationId: a.id },
      });
    }
    for (const p of onCanvas) {
      push({
        id: p.id,
        type: "entity",
        position: { x: p.x, y: p.y },
        width: p.width ?? 220,
        height: p.height ?? undefined,
        // Lets React Flow show (and focus) a new card before its first measurement.
        initialHeight: 80,
        zIndex: p.z,
        selected: selN.has(p.id),
        hidden: !visibleEntity.has(p.entityId),
        className: highlightN && !highlightN.has(p.entityId) ? "dimmed" : undefined,
        data: { entityId: p.entityId, degree: degree.get(p.entityId) ?? 0 },
      });
    }
    return { nodes, edges: edges as Edge[], entityToNode };
  }, [onCanvas, canvasAnnotations, entities, relationships, relTypes, visibleRelTypes, focusSet, filters.hiddenEntityTypes, selectedNodes, selectedEdges, analysis]);

  return { ...result, nodeCount: onCanvas.length + canvasAnnotations.length };
}

export type { Node };
