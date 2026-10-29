"use client";
/**
 * User-level commands. Each builds primitive ops and dispatches them as one
 * undoable step. Views never construct ops by hand.
 */
import {
  type AnnotationKind,
  type EntityType,
  type Entity,
  type Placement,
  type Relationship,
  type RelationshipDirection,
  makeAnnotation,
  makeCanvas,
  makeEntity,
  makePlacement,
  makeRelationship,
  newId,
  nowIso,
} from "@/core/model";
import type { Op } from "@/core/ops";
import { typeByKey, buildAdjacency, neighborhood, impactAnalysis, shortestPath } from "@/core/graph";
import { QUICK_CAPTURE_TYPE_KEY } from "@/core/presets";
import { demoScenarioOps } from "@/core/demo";
import { slugKey } from "@/core/fields";
import { useWorkspace } from "./store";

const st = () => useWorkspace.getState();

export function defaultEntityTypeId(): string | undefined {
  const s = st().snap;
  return (
    typeByKey(s.entityTypes, QUICK_CAPTURE_TYPE_KEY)?.id ??
    Object.values(s.entityTypes).sort((a, b) => a.sortOrder - b.sortOrder)[0]?.id
  );
}

export function placementOf(entityId: string, canvasId: string | null): Placement | undefined {
  if (!canvasId) return undefined;
  for (const p of Object.values(st().snap.placements)) if (p.entityId === entityId && p.canvasId === canvasId) return p;
  return undefined;
}

function topZ(canvasId: string): number {
  let z = 0;
  for (const p of Object.values(st().snap.placements)) if (p.canvasId === canvasId) z = Math.max(z, p.z);
  return z + 1;
}

/** Flow coordinates at the centre of the active canvas's saved viewport (approximate). */
export function viewCenter(): { x: number; y: number } {
  const s = st();
  const vp = s.activeCanvasId ? s.snap.canvases[s.activeCanvasId]?.viewport : undefined;
  if (!vp || typeof window === "undefined") return { x: 0, y: 0 };
  const w = window.innerWidth * 0.6;
  const h = window.innerHeight * 0.6;
  return { x: (-vp.x + w / 2) / vp.zoom - 110, y: (-vp.y + h / 2) / vp.zoom - 30 };
}

/** Create an entity and place it on the active canvas at a flow position. */
export function createEntityAt(pos: { x: number; y: number }, typeId?: string, title = ""): { entity: Entity; placement: Placement } | null {
  const canvasId = st().activeCanvasId;
  const tid = typeId ?? defaultEntityTypeId();
  if (!canvasId || !tid) return null;
  const entity = makeEntity({ typeId: tid, title });
  const placement = makePlacement({ canvasId, entityId: entity.id, x: pos.x, y: pos.y, z: topZ(canvasId) });
  const ok = st().dispatch(
    [
      { op: "create", kind: "entity", value: entity },
      { op: "create", kind: "placement", value: placement },
    ],
    { label: "إنشاء كيان" },
  );
  return ok ? { entity, placement } : null;
}

/**
 * Define a new entity type on the fly (the "أخرى" choice) and place its first
 * entity at a flow position, as one undoable step.
 */
export function createTypeWithEntityAt(input: { name: string; icon: string; color: string }, pos: { x: number; y: number }) {
  const s = st().snap;
  const canvasId = st().activeCanvasId;
  if (!canvasId) return null;
  const types = Object.values(s.entityTypes);
  const type: EntityType = {
    id: newId(),
    key: slugKey(input.name, types.map((t) => t.key)),
    name: input.name,
    nameEn: "",
    icon: input.icon,
    color: input.color,
    description: "",
    sortOrder: Math.max(0, ...types.map((t) => t.sortOrder)) + 1,
  };
  const entity = makeEntity({ typeId: type.id });
  const placement = makePlacement({ canvasId, entityId: entity.id, x: pos.x, y: pos.y, z: topZ(canvasId) });
  const ok = st().dispatch(
    [
      { op: "create", kind: "entityType", value: type },
      { op: "create", kind: "entity", value: entity },
      { op: "create", kind: "placement", value: placement },
    ],
    { label: "صنف جديد" },
  );
  if (ok) st().set({ editingNodeId: placement.id, selectedNodes: [placement.id], selectedEdges: [], newTypeAt: null });
  return ok ? { type, entity, placement } : null;
}

export function createAnnotationAt(kind: AnnotationKind, pos: { x: number; y: number }) {
  const canvasId = st().activeCanvasId;
  if (!canvasId) return null;
  const a = makeAnnotation({ canvasId, kind, x: pos.x, y: pos.y, text: kind === "frame" ? "إطار" : "" });
  st().dispatch([{ op: "create", kind: "annotation", value: a }], { label: "إضافة عنصر للوحة" });
  st().set({ editingNodeId: kind === "frame" ? null : a.id });
  return a;
}

export function placeEntities(entityIds: string[], origin: { x: number; y: number }) {
  const canvasId = st().activeCanvasId;
  if (!canvasId) return;
  let z = topZ(canvasId);
  const ops: Op[] = [];
  const cols = Math.ceil(Math.sqrt(entityIds.length));
  entityIds.forEach((id, i) => {
    if (placementOf(id, canvasId)) return;
    ops.push({
      op: "create",
      kind: "placement",
      value: makePlacement({ canvasId, entityId: id, x: origin.x + (i % cols) * 260, y: origin.y + Math.floor(i / cols) * 140, z: z++ }),
    });
  });
  if (ops.length) st().dispatch(ops, { label: "وضع في اللوحة" });
  return ops.length;
}

export function updateEntity(id: string, patch: Partial<Omit<Entity, "id">>) {
  st().dispatch([{ op: "update", kind: "entity", id, patch: { ...patch, updatedAt: nowIso() } }], { label: "تعديل كيان" });
}

export function updateRelationship(id: string, patch: Partial<Omit<Relationship, "id">>) {
  st().dispatch([{ op: "update", kind: "relationship", id, patch: { ...patch, updatedAt: nowIso() } }], {
    label: "تعديل علاقة",
  });
}

export function createRelationship(input: {
  typeId: string;
  sourceId: string;
  targetId: string;
  label?: string;
  direction?: RelationshipDirection;
  visual?: Relationship["visual"];
}): Relationship | null {
  const rel = makeRelationship(input);
  return st().dispatch([{ op: "create", kind: "relationship", value: rel }], { label: "إنشاء علاقة" }) ? rel : null;
}

/** Remove cards/annotations from the canvas. Entities stay in the knowledge graph. */
export function removeFromCanvas(nodeIds: string[]) {
  const s = st().snap;
  const ops: Op[] = [];
  for (const id of nodeIds) {
    if (s.placements[id]) ops.push({ op: "delete", kind: "placement", id });
    else if (s.annotations[id]) ops.push({ op: "delete", kind: "annotation", id });
  }
  if (!ops.length) return;
  const placements = ops.filter((o) => o.kind === "placement").length;
  if (st().dispatch(ops, { label: "إزالة من اللوحة" }) && placements)
    st().toast(
      placements === 1 ? "أُزيلت البطاقة من اللوحة؛ الكيان باقٍ في النظام." : `أُزيلت ${placements} بطاقات من اللوحة؛ الكيانات باقية.`,
      "info",
      { label: "تراجع", run: () => st().undo() },
    );
  st().set({ selectedNodes: [], inspected: null });
}

export function deleteEntities(entityIds: string[]) {
  const ops: Op[] = entityIds.map((id) => ({ op: "delete", kind: "entity", id }));
  if (st().dispatch(ops, { label: "حذف كيان" })) {
    st().set({ inspected: null, selectedNodes: [] });
    st().toast(entityIds.length === 1 ? "حُذف الكيان وعلاقاته." : `حُذف ${entityIds.length} كيانات.`, "info", {
      label: "تراجع",
      run: () => st().undo(),
    });
  }
}

export function deleteRelationships(ids: string[]) {
  const ops: Op[] = ids.map((id) => ({ op: "delete", kind: "relationship", id }));
  if (st().dispatch(ops, { label: "حذف علاقة" })) st().set({ inspected: null, selectedEdges: [] });
}

// ---------------------------------------------------------------------------
// Clipboard: copy / paste / duplicate
// ---------------------------------------------------------------------------

interface ClipItem {
  kind: "entity" | "annotation";
  id: string;
  dx: number;
  dy: number;
  annotation?: ReturnType<typeof makeAnnotation>;
  style?: Placement["style"];
}
let clipboard: ClipItem[] = [];

export function copySelection(): number {
  const s = st().snap;
  const ids = st().selectedNodes;
  const items: ClipItem[] = [];
  let minX = Infinity;
  let minY = Infinity;
  for (const id of ids) {
    const p = s.placements[id] ?? s.annotations[id];
    if (p) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
    }
  }
  for (const id of ids) {
    const p = s.placements[id];
    const a = s.annotations[id];
    if (p) items.push({ kind: "entity", id: p.entityId, dx: p.x - minX, dy: p.y - minY, style: p.style });
    if (a) items.push({ kind: "annotation", id: a.id, dx: a.x - minX, dy: a.y - minY, annotation: a });
  }
  clipboard = items;
  return items.length;
}

/**
 * Paste at a position. An entity not yet on this canvas is placed as a
 * *reference* (same entity, no copy). An entity already here — or every entity
 * when `asCopy` — is duplicated, together with the relationships among the
 * duplicated set.
 */
export function paste(at: { x: number; y: number }, asCopy = false, items: ClipItem[] = clipboard) {
  const canvasId = st().activeCanvasId;
  const s = st().snap;
  if (!canvasId || !items.length) return;
  let z = topZ(canvasId);
  const ops: Op[] = [];
  const copies = new Map<string, string>();
  const newNodeIds: string[] = [];
  const stamp = nowIso();

  for (const it of items) {
    const pos = { x: at.x + it.dx, y: at.y + it.dy };
    if (it.kind === "annotation" && it.annotation) {
      const a = { ...it.annotation, id: newId(), canvasId, ...pos, z: z++ };
      ops.push({ op: "create", kind: "annotation", value: a });
      newNodeIds.push(a.id);
      continue;
    }
    const entity = s.entities[it.id];
    if (!entity) continue;
    let entityId = entity.id;
    if (asCopy || placementOf(entity.id, canvasId)) {
      const copy = { ...entity, id: newId(), createdAt: stamp, updatedAt: stamp };
      copies.set(entity.id, copy.id);
      ops.push({ op: "create", kind: "entity", value: copy });
      entityId = copy.id;
    }
    const p = makePlacement({ canvasId, entityId, ...pos, z: z++, style: it.style ?? {} });
    ops.push({ op: "create", kind: "placement", value: p });
    newNodeIds.push(p.id);
  }
  for (const r of Object.values(s.relationships)) {
    const src = copies.get(r.sourceId);
    const tgt = copies.get(r.targetId);
    if (src && tgt)
      ops.push({
        op: "create",
        kind: "relationship",
        value: { ...r, id: newId(), sourceId: src, targetId: tgt, createdAt: stamp, updatedAt: stamp },
      });
  }
  if (st().dispatch(ops, { label: "لصق" })) st().set({ selectedNodes: newNodeIds, selectedEdges: [] });
}

export function duplicateSelection() {
  const s = st().snap;
  const first = st().selectedNodes.map((id) => s.placements[id] ?? s.annotations[id]).find(Boolean);
  if (!first) return;
  const saved = clipboard;
  copySelection();
  const items = clipboard;
  clipboard = saved;
  const minX = Math.min(...st().selectedNodes.map((id) => (s.placements[id] ?? s.annotations[id])?.x ?? Infinity));
  const minY = Math.min(...st().selectedNodes.map((id) => (s.placements[id] ?? s.annotations[id])?.y ?? Infinity));
  paste({ x: minX + 40, y: minY + 40 }, true, items);
}

export function hasClipboard() {
  return clipboard.length > 0;
}

// ---------------------------------------------------------------------------
// Canvases
// ---------------------------------------------------------------------------

export function createCanvas(name: string) {
  const s = st().snap;
  const order = Math.max(0, ...Object.values(s.canvases).map((c) => c.sortOrder)) + 1;
  const c = makeCanvas({ name, sortOrder: order });
  if (st().dispatch([{ op: "create", kind: "canvas", value: c }], { label: "لوحة جديدة" }))
    st().set({ activeCanvasId: c.id, view: "canvas", focus: null, analysis: null });
}

export function loadDemoScenario() {
  try {
    const s = st().snap;
    const order = Math.max(0, ...Object.values(s.canvases).map((c) => c.sortOrder)) + 1;
    const { ops, ids } = demoScenarioOps(s, order);
    if (st().dispatch(ops, { label: "تحميل السيناريو التجريبي" })) {
      st().set({ activeCanvasId: ids.canvasId, view: "canvas", focus: null, analysis: null });
      st().toast("حُمّل السيناريو التجريبي في لوحة مستقلة.", "info", { label: "تراجع", run: () => st().undo() });
    }
  } catch (err) {
    st().toast(err instanceof Error ? err.message : String(err), "error");
  }
}

// ---------------------------------------------------------------------------
// Analyses (always explainable: every highlighted item lists its basis)
// ---------------------------------------------------------------------------

function relText(id: string) {
  const s = st().snap;
  const r = s.relationships[id];
  if (!r) return "";
  const t = s.relationshipTypes[r.typeId];
  return `${s.entities[r.sourceId]?.title || "؟"} ← ${t?.name ?? ""} ← ${s.entities[r.targetId]?.title || "؟"}`;
}

export function runImpactAnalysis(entityId: string) {
  const s = st().snap;
  const res = impactAnalysis(s, entityId);
  st().set({
    analysis: {
      title: `ما الذي يتأثر إذا تعطّل «${s.entities[entityId]?.title || "بلا عنوان"}»؟`,
      entityIds: [entityId, ...res.map((r) => r.entityId)],
      relationshipIds: [...new Set(res.flatMap((r) => r.via))],
      rows: res.map((r) => ({ entityId: r.entityId, detail: r.via.map(relText).join(" ⟵ "), via: r.via })),
    },
  });
}

export function runPathAnalysis(fromId: string, toId: string) {
  const s = st().snap;
  const path = shortestPath(buildAdjacency(Object.values(s.relationships)), fromId, toId);
  if (!path) {
    st().toast("لا يوجد مسار علاقات بين العنصرين.", "info");
    return;
  }
  st().set({
    analysis: {
      title: `المسار بين «${s.entities[fromId]?.title}» و«${s.entities[toId]?.title}»`,
      entityIds: path.entityIds,
      relationshipIds: path.relationshipIds,
      rows: path.relationshipIds.map((rid) => ({ entityId: "", detail: relText(rid), via: [rid] })),
    },
  });
}

/** Place the neighbours of an entity (up to depth) around it on the current canvas. */
export function bringNeighbours(entityId: string, depth: number) {
  const s = st().snap;
  const canvasId = st().activeCanvasId;
  const center = placementOf(entityId, canvasId);
  if (!canvasId || !center) return;
  const hidden = new Set(st().filters.hiddenRelationshipTypes);
  const typeIds = new Set(Object.keys(s.relationshipTypes).filter((id) => !hidden.has(id)));
  const n = neighborhood(buildAdjacency(Object.values(s.relationships)), [entityId], depth, { typeIds });
  const missing = [...n.entities.entries()].filter(([id]) => !placementOf(id, canvasId));
  if (!missing.length) {
    st().toast("كل العناصر المرتبطة موجودة في اللوحة.", "info");
    return;
  }
  let z = topZ(canvasId);
  const ops: Op[] = missing.map(([id, d], i) => {
    const angle = (2 * Math.PI * i) / missing.length;
    const radius = 260 * d + 40;
    return {
      op: "create",
      kind: "placement",
      value: makePlacement({ canvasId, entityId: id, x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius, z: z++ }),
    };
  });
  st().dispatch(ops, { label: "إظهار المرتبطين" });
}

export function quickCapture(lines: string[], place: boolean) {
  const typeId = defaultEntityTypeId();
  const canvasId = st().activeCanvasId;
  if (!typeId) return 0;
  const ops: Op[] = [];
  let z = canvasId ? topZ(canvasId) : 0;
  const origin = viewCenter();
  lines
    .map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean)
    .forEach((title, i) => {
      const e = makeEntity({ typeId, title });
      ops.push({ op: "create", kind: "entity", value: e });
      if (place && canvasId)
        ops.push({
          op: "create",
          kind: "placement",
          value: makePlacement({ canvasId, entityId: e.id, x: origin.x + (i % 4) * 250, y: origin.y + Math.floor(i / 4) * 130, z: z++ }),
        });
    });
  if (ops.length) st().dispatch(ops, { label: "التقاط سريع" });
  return ops.filter((o) => o.kind === "entity").length;
}
