"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type FinalConnectionState,
  type NodeChange,
  type OnConnectEnd,
  type Viewport,
} from "@xyflow/react";
import { cameraTo, useWorkspace } from "../store";
import { copySelection, createEntityAt, duplicateSelection, paste, placeEntities, removeFromCanvas, deleteRelationships } from "../actions";
import { EntityNode } from "./EntityNode";
import { AnnotationNode } from "./AnnotationNode";
import { RelationshipEdge } from "./RelationshipEdge";
import { RelationshipPicker, type PickerRequest } from "./RelationshipPicker";
import { sameEdge, sameNode, useCanvasGraph, type CanvasNode } from "./useCanvasGraph";
import { CanvasToolbar } from "./CanvasToolbar";
import { ContextMenu, type MenuRequest } from "./ContextMenu";
import { AnalysisPanel } from "./AnalysisPanel";
import { EmptyCanvasHint } from "./EmptyCanvasHint";

const nodeTypes = { entity: EntityNode, annotation: AnnotationNode };
const edgeTypes = { relationship: RelationshipEdge };
export const ENTITY_DRAG_MIME = "application/x-mindspace-entity";

export function CanvasView() {
  const canvasId = useWorkspace((s) => s.activeCanvasId);
  const canvas = useWorkspace((s) => (canvasId ? s.snap.canvases[canvasId] : undefined));
  if (!canvasId || !canvas) return <div className="flex h-full items-center justify-center text-sm text-[var(--fg-muted)]">لا توجد لوحة. أنشئ لوحة من الشريط الجانبي.</div>;
  return (
    <ReactFlowProvider key={canvasId}>
      <CanvasInner canvasId={canvasId} initialViewport={canvas.viewport} />
    </ReactFlowProvider>
  );
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

function CanvasInner({ canvasId, initialViewport }: { canvasId: string; initialViewport: Viewport }) {
  const rf = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const { nodes: built, edges: builtEdges, entityToNode, nodeCount } = useCanvasGraph(canvasId);
  const [nodes, setNodes] = useState<CanvasNode[]>(built);
  const [picker, setPicker] = useState<PickerRequest | null>(null);
  const [menu, setMenu] = useState<MenuRequest | null>(null);
  const showMinimap = useWorkspace((s) => s.showMinimap);
  const tool = useWorkspace((s) => s.tool);
  const cameraRequest = useWorkspace((s) => s.cameraRequest);
  const frameDrag = useRef<{ frameId: string; start: { x: number; y: number }; members: Map<string, { x: number; y: number }> } | null>(null);

  // Store -> local nodes (derived state). Unchanged cards keep their previous
  // object, and with it React Flow's measurements, so only changed cards re-render.
  const [prevBuilt, setPrevBuilt] = useState(built);
  const [edges, setEdges] = useState(builtEdges);
  const [prevBuiltEdges, setPrevBuiltEdges] = useState(builtEdges);
  if (builtEdges !== prevBuiltEdges) {
    // Same idea for edges: with thousands of lines, re-creating them all on a
    // selection change would re-render every one.
    setPrevBuiltEdges(builtEdges);
    const byId = new Map(edges.map((e) => [e.id, e]));
    setEdges(builtEdges.map((e) => {
      const p = byId.get(e.id);
      return p && sameEdge(p, e) ? p : e;
    }));
  }
  if (built !== prevBuilt) {
    setPrevBuilt(built);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    setNodes(
      built.map((n) => {
        const p = byId.get(n.id);
        if (!p) return n;
        if (sameNode(p, n)) return p;
        return p.measured ? ({ ...n, measured: p.measured } as CanvasNode) : n;
      }),
    );
  }

  const flowPointAt = useCallback(
    (clientX?: number, clientY?: number) => {
      if (clientX !== undefined && clientY !== undefined) return rf.screenToFlowPosition({ x: clientX, y: clientY });
      const r = wrapper.current?.getBoundingClientRect();
      const p = pointer.current ?? (r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 });
      return rf.screenToFlowPosition(p);
    },
    [rf],
  );

  // ---------------- selection ----------------
  const setSelection = useCallback((nodeIds: string[], edgeIds: string[]) => {
    const st = useWorkspace.getState();
    const s = st.snap;
    let inspected = st.inspected;
    if (nodeIds.length === 1 && edgeIds.length === 0 && s.placements[nodeIds[0]])
      inspected = { kind: "entity", id: s.placements[nodeIds[0]].entityId };
    else if (edgeIds.length === 1 && nodeIds.length === 0) inspected = { kind: "relationship", id: edgeIds[0] };
    else if (nodeIds.length === 0 && edgeIds.length === 0) inspected = null;
    st.set({ selectedNodes: nodeIds, selectedEdges: edgeIds, inspected });
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      const sel = changes.filter((c) => c.type === "select");
      if (sel.length) {
        const st = useWorkspace.getState();
        const cur = new Set(st.selectedNodes);
        for (const c of sel) if (c.type === "select") (c.selected ? cur.add(c.id) : cur.delete(c.id));
        const edgesSel = sel.some((c) => c.type === "select" && c.selected) ? [] : st.selectedEdges;
        setSelection([...cur], edgesSel);
      }
      const rest = changes.filter((c) => c.type !== "select" && c.type !== "remove");
      if (rest.length) setNodes((nds) => applyNodeChanges(rest, nds));
    },
    [setSelection],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const sel = changes.filter((c) => c.type === "select");
      if (!sel.length) return;
      const st = useWorkspace.getState();
      const cur = new Set(st.selectedEdges);
      for (const c of sel) if (c.type === "select") (c.selected ? cur.add(c.id) : cur.delete(c.id));
      setSelection(sel.some((c) => c.type === "select" && c.selected) ? [] : st.selectedNodes, [...cur]);
    },
    [setSelection],
  );

  // ---------------- moving & resizing (presentation only) ----------------
  const commitPositions = useCallback((moved: Array<{ id: string; x: number; y: number }>) => {
    const st = useWorkspace.getState();
    const s = st.snap;
    const ops = moved.flatMap(({ id, x, y }) => {
      const cur = s.placements[id] ?? s.annotations[id];
      if (!cur || (cur.x === x && cur.y === y)) return [];
      return [{ op: "update" as const, kind: s.placements[id] ? ("placement" as const) : ("annotation" as const), id, patch: { x, y } }];
    });
    if (ops.length) st.dispatch(ops, { label: "تحريك" });
  }, []);

  const onNodeDragStart = useCallback(
    (_: unknown, node: CanvasNode) => {
      const s = useWorkspace.getState().snap;
      const frame = s.annotations[node.id];
      if (!frame || frame.kind !== "frame") return;
      // Cards fully inside a frame move with it.
      const members = new Map<string, { x: number; y: number }>();
      for (const n of nodes) {
        if (n.id === node.id || n.selected) continue;
        const w = n.measured?.width ?? n.width ?? 0;
        const h = n.measured?.height ?? n.height ?? 0;
        if (n.position.x >= frame.x && n.position.y >= frame.y && n.position.x + w <= frame.x + frame.width && n.position.y + h <= frame.y + frame.height)
          members.set(n.id, { ...n.position });
      }
      frameDrag.current = { frameId: node.id, start: { x: frame.x, y: frame.y }, members };
    },
    [nodes],
  );

  const onNodeDrag = useCallback((_: unknown, node: CanvasNode) => {
    const fd = frameDrag.current;
    if (!fd || fd.frameId !== node.id || !fd.members.size) return;
    const dx = node.position.x - fd.start.x;
    const dy = node.position.y - fd.start.y;
    setNodes((nds) => nds.map((n) => (fd.members.has(n.id) ? { ...n, position: { x: fd.members.get(n.id)!.x + dx, y: fd.members.get(n.id)!.y + dy } } : n)));
  }, []);

  const onNodeDragStop = useCallback(
    (_: unknown, node: CanvasNode, dragged: CanvasNode[]) => {
      const moved = (dragged.length ? dragged : [node]).map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }));
      const fd = frameDrag.current;
      if (fd && fd.frameId === node.id) {
        const dx = node.position.x - fd.start.x;
        const dy = node.position.y - fd.start.y;
        for (const [id, p] of fd.members) moved.push({ id, x: p.x + dx, y: p.y + dy });
      }
      frameDrag.current = null;
      commitPositions(moved);
    },
    [commitPositions],
  );

  // ---------------- connecting ----------------
  const nodeEntity = useCallback((nodeId: string | null | undefined) => (nodeId ? useWorkspace.getState().snap.placements[nodeId]?.entityId : undefined), []);

  const onConnect = useCallback(
    (c: Connection) => {
      const sourceId = nodeEntity(c.source);
      const targetId = nodeEntity(c.target);
      if (!sourceId || !targetId || sourceId === targetId) return;
      const p = pointer.current ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      setPicker({ sourceId, targetId, x: p.x, y: p.y });
    },
    [nodeEntity],
  );

  const onConnectEnd: OnConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (state.isValid || !state.fromNode) return;
      const sourceId = nodeEntity(state.fromNode.id);
      if (!sourceId) return;
      const pt = "changedTouches" in event ? event.changedTouches[0] : event;
      // Dropped on a card's body rather than its edge point: connect to that card.
      const overId = document.elementFromPoint(pt.clientX, pt.clientY)?.closest(".react-flow__node")?.getAttribute("data-id");
      const overEntity = nodeEntity(overId ?? state.toNode?.id);
      if (overEntity) {
        if (overEntity !== sourceId) setPicker({ sourceId, targetId: overEntity, x: pt.clientX, y: pt.clientY });
        return;
      }
      if (state.toNode) return;
      // Dropped on empty space: create a new card there and link to it.
      const flow = rf.screenToFlowPosition({ x: pt.clientX, y: pt.clientY });
      const created = createEntityAt({ x: flow.x - 110, y: flow.y - 30 });
      if (!created) return;
      setPicker({
        sourceId,
        targetId: created.entity.id,
        x: pt.clientX,
        y: pt.clientY,
        onCancel: () => useWorkspace.getState().undo(),
      });
    },
    [nodeEntity, rf],
  );

  // ---------------- camera ----------------
  const onMoveEnd = useCallback(
    (_: unknown, vp: Viewport) => {
      const st = useWorkspace.getState();
      const c = st.snap.canvases[canvasId];
      if (!c) return;
      const r = (n: number) => Math.round(n * 100) / 100;
      const next = { x: r(vp.x), y: r(vp.y), zoom: Math.round(vp.zoom * 1000) / 1000 };
      if (c.viewport.x === next.x && c.viewport.y === next.y && c.viewport.zoom === next.zoom) return;
      st.dispatch([{ op: "update", kind: "canvas", id: canvasId, patch: { viewport: next } }], { undoable: false });
    },
    [canvasId],
  );

  useEffect(() => {
    if (!cameraRequest) return;
    const t = setTimeout(() => {
      void rf.fitView({ nodes: cameraRequest.nodeIds.map((id) => ({ id })), duration: 450, maxZoom: 1.3, padding: 0.5 });
    }, 60);
    return () => clearTimeout(t);
  }, [cameraRequest, rf]);

  // ---------------- keyboard ----------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || useWorkspace.getState().view !== "canvas") return;
      const st = useWorkspace.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (st.selectedNodes.length) removeFromCanvas(st.selectedNodes);
        else if (st.selectedEdges.length) deleteRelationships(st.selectedEdges);
        e.preventDefault();
      } else if (mod && e.key.toLowerCase() === "c") {
        if (copySelection()) st.toast("نُسخ العنصر المحدد.", "info");
      } else if (mod && e.key.toLowerCase() === "v") {
        const at = flowPointAt();
        paste(at, e.shiftKey);
        e.preventDefault();
      } else if (mod && e.key.toLowerCase() === "d") {
        duplicateSelection();
        e.preventDefault();
      } else if (mod && e.key.toLowerCase() === "a") {
        setSelection(rf.getNodes().filter((n) => !n.hidden).map((n) => n.id), []);
        e.preventDefault();
      } else if (e.shiftKey && (e.code === "Digit1" || e.key === "!")) {
        void rf.fitView({ duration: 400, padding: 0.15 });
      } else if (e.shiftKey && (e.code === "Digit2" || e.key === "@")) {
        if (st.selectedNodes.length) void rf.fitView({ nodes: st.selectedNodes.map((id) => ({ id })), duration: 400, maxZoom: 1.5, padding: 0.4 });
      } else if (e.key === "Escape") {
        st.set({ focus: null, analysis: null, selectedNodes: [], selectedEdges: [], inspected: null });
      } else if (e.key === "Enter" && st.selectedNodes.length === 1) {
        st.set({ editingNodeId: st.selectedNodes[0] });
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flowPointAt, rf, setSelection]);

  // ---------------- pointer, double-click, drop ----------------
  const onDoubleClick = (e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).classList.contains("react-flow__pane")) return;
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const created = createEntityAt({ x: p.x - 110, y: p.y - 30 });
    if (created) useWorkspace.getState().set({ editingNodeId: created.placement.id, selectedNodes: [created.placement.id], selectedEdges: [] });
  };

  const onDrop = (e: React.DragEvent) => {
    const entityId = e.dataTransfer.getData(ENTITY_DRAG_MIME);
    if (!entityId) return;
    e.preventDefault();
    const existing = entityToNode.get(entityId);
    if (existing) {
      useWorkspace.getState().set({ cameraRequest: cameraTo([existing]), selectedNodes: [existing] });
      return;
    }
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    placeEntities([entityId], { x: p.x - 110, y: p.y - 30 });
  };

  const proOptions = useMemo(() => ({ hideAttribution: false }), []);

  return (
    <div
      ref={wrapper}
      dir="ltr"
      className="relative h-full w-full"
      onMouseMove={(e) => (pointer.current = { x: e.clientX, y: e.clientY })}
      onDoubleClick={onDoubleClick}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(ENTITY_DRAG_MIME)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={onDrop}
    >
      <ReactFlow<CanvasNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onMoveEnd={onMoveEnd}
        onNodeDoubleClick={(_, n) => useWorkspace.getState().set({ editingNodeId: n.id })}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          setMenu({ kind: "pane", x: e.clientX, y: e.clientY, flow: rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }) });
        }}
        onNodeContextMenu={(e, n) => {
          e.preventDefault();
          const st = useWorkspace.getState();
          if (!st.selectedNodes.includes(n.id)) setSelection([n.id], []);
          setMenu({ kind: "node", id: n.id, x: e.clientX, y: e.clientY, flow: rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }) });
        }}
        onEdgeContextMenu={(e, edge) => {
          e.preventDefault();
          setSelection([], [edge.id]);
          setMenu({ kind: "edge", id: edge.id, x: e.clientX, y: e.clientY, flow: rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }) });
        }}
        onPaneClick={() => setMenu(null)}
        defaultViewport={initialViewport}
        minZoom={0.05}
        maxZoom={3}
        zoomOnDoubleClick={false}
        deleteKeyCode={null}
        selectionKeyCode="Shift"
        multiSelectionKeyCode={["Shift", "Meta", "Control"]}
        selectionOnDrag={tool === "select"}
        panOnDrag={tool === "select" ? [1, 2] : true}
        selectionMode={SelectionMode.Partial}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={36}
        onlyRenderVisibleElements={nodeCount > 250}
        elevateNodesOnSelect={false}
        proOptions={proOptions}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="var(--canvas-dot)" />
        {showMinimap && (
          <MiniMap
            pannable
            zoomable
            position="bottom-left"
            nodeColor={(n) => {
              const s = useWorkspace.getState().snap;
              const p = s.placements[n.id];
              if (!p) return s.annotations[n.id]?.style.color ?? "#d4d4d4";
              const e = s.entities[p.entityId];
              return p.style.color ?? (e ? s.entityTypes[e.typeId]?.color : undefined) ?? "#94a3b8";
            }}
            maskColor="color-mix(in srgb, var(--bg) 70%, transparent)"
          />
        )}
        <Controls position="bottom-right" showInteractive={false} />
      </ReactFlow>
      <div dir="rtl">
        <CanvasToolbar flowPointAt={flowPointAt} />
        <AnalysisPanel />
        {nodeCount === 0 && <EmptyCanvasHint />}
        {picker && <RelationshipPicker req={picker} onClose={() => setPicker(null)} />}
        {menu && <ContextMenu req={menu} onClose={() => setMenu(null)} />}
      </div>
    </div>
  );
}
