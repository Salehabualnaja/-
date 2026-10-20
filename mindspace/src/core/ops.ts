/**
 * Operations: the only way data changes.
 *
 * Every mutation (from the canvas, the table, the inspector, the demo loader…)
 * is expressed as a list of primitive Ops. The same Ops are
 *   - applied optimistically in the browser by `applyOps` (pure reducer),
 *   - sent to the server, which applies them to PostgreSQL in one transaction,
 *   - inverted by `invertOps` to give Undo / Redo for free.
 */
import { z } from "zod";
import {
  Annotation,
  Canvas,
  Entity,
  EntityType,
  FieldDefinition,
  Id,
  Placement,
  Relationship,
  RelationshipType,
  type Snapshot,
  Workspace,
} from "./model";

export const RECORD_SCHEMAS = {
  entityType: EntityType,
  field: FieldDefinition,
  relationshipType: RelationshipType,
  entity: Entity,
  relationship: Relationship,
  canvas: Canvas,
  placement: Placement,
  annotation: Annotation,
} as const;

export type RecordKind = keyof typeof RECORD_SCHEMAS;
export const RECORD_KINDS = Object.keys(RECORD_SCHEMAS) as RecordKind[];

interface RecordMap {
  entityType: EntityType;
  field: FieldDefinition;
  relationshipType: RelationshipType;
  entity: Entity;
  relationship: Relationship;
  canvas: Canvas;
  placement: Placement;
  annotation: Annotation;
}

/** Snapshot collection holding each record kind. */
export const COLLECTION: { [K in RecordKind]: keyof Snapshot } = {
  entityType: "entityTypes",
  field: "fields",
  relationshipType: "relationshipTypes",
  entity: "entities",
  relationship: "relationships",
  canvas: "canvases",
  placement: "placements",
  annotation: "annotations",
};

export type CreateOp<K extends RecordKind = RecordKind> = { op: "create"; kind: K; value: RecordMap[K] };
export type UpdateOp<K extends RecordKind = RecordKind> = {
  op: "update";
  kind: K;
  id: string;
  patch: Partial<Omit<RecordMap[K], "id">>;
};
export type DeleteOp<K extends RecordKind = RecordKind> = { op: "delete"; kind: K; id: string };
export type WorkspaceOp = { op: "update"; kind: "workspace"; patch: Partial<Omit<Workspace, "id">> };

export type Op =
  | { [K in RecordKind]: CreateOp<K> }[RecordKind]
  | { [K in RecordKind]: UpdateOp<K> }[RecordKind]
  | { [K in RecordKind]: DeleteOp<K> }[RecordKind]
  | WorkspaceOp;

// ---------------------------------------------------------------------------
// Validation (used by the API before anything touches the database)
// ---------------------------------------------------------------------------

function opSchemasFor(kind: RecordKind) {
  // Zod object schemas share the same API; the cast keeps the union manageable.
  const schema = RECORD_SCHEMAS[kind] as unknown as z.ZodObject<z.ZodRawShape>;
  return [
    z.object({ op: z.literal("create"), kind: z.literal(kind), value: schema }),
    z.object({
      op: z.literal("update"),
      kind: z.literal(kind),
      id: Id,
      patch: schema.omit({ id: true } as never).partial().strict(),
    }),
    z.object({ op: z.literal("delete"), kind: z.literal(kind), id: Id }),
  ];
}

export const OpSchema = z.union([
  ...RECORD_KINDS.flatMap(opSchemasFor),
  z.object({
    op: z.literal("update"),
    kind: z.literal("workspace"),
    patch: Workspace.omit({ id: true }).partial().strict(),
  }),
] as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]) as unknown as z.ZodType<Op>;

export const OpBatchSchema = z.object({
  batchId: Id,
  ops: z.array(OpSchema).min(1).max(5000),
});
export type OpBatch = z.infer<typeof OpBatchSchema>;

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export class OpError extends Error {
  constructor(
    public code: "not_found" | "exists" | "invalid_ref" | "in_use" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "OpError";
  }
}

function coll<K extends RecordKind>(s: Snapshot, kind: K): Record<string, RecordMap[K]> {
  return s[COLLECTION[kind]] as unknown as Record<string, RecordMap[K]>;
}

/** Records removed together with the given record (cascade), in restore order. */
export function cascadeOf(s: Snapshot, kind: RecordKind, id: string): Array<{ kind: RecordKind; value: unknown }> {
  const out: Array<{ kind: RecordKind; value: unknown }> = [];
  if (kind === "entity") {
    for (const r of Object.values(s.relationships))
      if (r.sourceId === id || r.targetId === id) out.push({ kind: "relationship", value: r });
    for (const p of Object.values(s.placements)) if (p.entityId === id) out.push({ kind: "placement", value: p });
  } else if (kind === "canvas") {
    for (const p of Object.values(s.placements)) if (p.canvasId === id) out.push({ kind: "placement", value: p });
    for (const a of Object.values(s.annotations)) if (a.canvasId === id) out.push({ kind: "annotation", value: a });
  } else if (kind === "entityType") {
    for (const f of Object.values(s.fields)) if (f.entityTypeId === id) out.push({ kind: "field", value: f });
  } else if (kind === "relationshipType") {
    for (const f of Object.values(s.fields)) if (f.relationshipTypeId === id) out.push({ kind: "field", value: f });
  }
  return out;
}

function checkRefs(s: Snapshot, kind: RecordKind, v: Record<string, unknown>) {
  const need = (ok: boolean, what: string) => {
    if (!ok) throw new OpError("invalid_ref", `${kind}: ${what} does not exist`);
  };
  switch (kind) {
    case "entity":
      if ("typeId" in v) need(!!s.entityTypes[v.typeId as string], "entity type");
      break;
    case "relationship":
      if ("typeId" in v) need(!!s.relationshipTypes[v.typeId as string], "relationship type");
      if ("sourceId" in v) need(!!s.entities[v.sourceId as string], "source entity");
      if ("targetId" in v) need(!!s.entities[v.targetId as string], "target entity");
      break;
    case "placement":
      if ("canvasId" in v) need(!!s.canvases[v.canvasId as string], "canvas");
      if ("entityId" in v) need(!!s.entities[v.entityId as string], "entity");
      break;
    case "annotation":
      if ("canvasId" in v) need(!!s.canvases[v.canvasId as string], "canvas");
      break;
    case "field": {
      const et = v.entityTypeId as string | null | undefined;
      const rt = v.relationshipTypeId as string | null | undefined;
      if (et) need(!!s.entityTypes[et], "entity type");
      if (rt) need(!!s.relationshipTypes[rt], "relationship type");
      break;
    }
  }
}

/**
 * Copy-on-write draft used while applying a batch: each collection is copied
 * at most once per batch, so applying N ops is O(N) rather than O(N²), and
 * the input snapshot is never touched (collections that did not change keep
 * their identity, which lets React skip work).
 */
class Draft {
  s: Snapshot;
  private copied = new Set<keyof Snapshot>();
  private placementKeys: Set<string> | null = null;

  constructor(base: Snapshot) {
    this.s = { ...base };
  }

  mut<K extends RecordKind>(kind: K): Record<string, RecordMap[K]> {
    const key = COLLECTION[kind];
    if (!this.copied.has(key)) {
      (this.s as unknown as Record<string, unknown>)[key] = { ...(this.s[key] as object) };
      this.copied.add(key);
    }
    return coll(this.s, kind);
  }

  /** "canvasId|entityId" of every placement, built lazily (one entity per canvas). */
  placed(): Set<string> {
    if (!this.placementKeys) {
      this.placementKeys = new Set();
      for (const p of Object.values(this.s.placements)) this.placementKeys.add(`${p.canvasId}|${p.entityId}`);
    }
    return this.placementKeys;
  }

  forgetPlacements() {
    this.placementKeys = null;
  }

  unplace(p: Placement) {
    this.placementKeys?.delete(`${p.canvasId}|${p.entityId}`);
  }
}

function applyOne(d: Draft, op: Op): void {
  const s = d.s;
  if (op.kind === "workspace") {
    d.s.workspace = { ...s.workspace, ...op.patch };
    return;
  }
  const records = coll(s, op.kind);

  if (op.op === "create") {
    const value = op.value as { id: string };
    if (records[value.id]) throw new OpError("exists", `${op.kind} ${value.id} already exists`);
    checkRefs(s, op.kind, value as Record<string, unknown>);
    if (op.kind === "placement") {
      const p = op.value as Placement;
      const k = `${p.canvasId}|${p.entityId}`;
      if (d.placed().has(k)) throw new OpError("conflict", "entity already placed on this canvas");
      d.placed().add(k);
    }
    if (op.kind === "field") {
      const f = op.value as FieldDefinition;
      if (!!f.entityTypeId === !!f.relationshipTypeId)
        throw new OpError("invalid_ref", "field must belong to exactly one entity type or relationship type");
    }
    d.mut(op.kind)[value.id] = value as never;
    return;
  }

  const current = records[op.id];
  if (!current) throw new OpError("not_found", `${op.kind} ${op.id} not found`);

  if (op.op === "update") {
    checkRefs(s, op.kind, op.patch as Record<string, unknown>);
    if (op.kind === "placement" && ("canvasId" in op.patch || "entityId" in op.patch)) d.forgetPlacements();
    d.mut(op.kind)[op.id] = { ...current, ...op.patch, id: op.id } as never;
    return;
  }

  // delete
  if (op.kind === "entityType" && Object.values(s.entities).some((e) => e.typeId === op.id))
    throw new OpError("in_use", "entity type is used by entities");
  if (op.kind === "relationshipType" && Object.values(s.relationships).some((r) => r.typeId === op.id))
    throw new OpError("in_use", "relationship type is used by relationships");

  const cascade = cascadeOf(s, op.kind, op.id);
  for (const c of cascade) {
    if (c.kind === "placement") d.unplace(c.value as Placement);
    delete d.mut(c.kind)[(c.value as { id: string }).id];
  }
  if (op.kind === "placement") d.unplace(current as Placement);
  delete d.mut(op.kind)[op.id];
}

/** Apply ops atomically: either all succeed or an OpError is thrown and `s` is untouched. */
export function applyOps(s: Snapshot, ops: readonly Op[]): Snapshot {
  if (!ops.length) return s;
  const d = new Draft(s);
  for (const op of ops) applyOne(d, op);
  return d.s;
}

// ---------------------------------------------------------------------------
// Inversion (Undo / Redo)
// ---------------------------------------------------------------------------

function invertOne(s: Snapshot, op: Op): Op[] {
  if (op.kind === "workspace") {
    const prev: Record<string, unknown> = {};
    for (const k of Object.keys(op.patch)) prev[k] = (s.workspace as Record<string, unknown>)[k];
    return [{ op: "update", kind: "workspace", patch: prev }];
  }
  if (op.op === "create") return [{ op: "delete", kind: op.kind, id: (op.value as { id: string }).id } as Op];

  const current = coll(s, op.kind)[op.id] as unknown as Record<string, unknown> | undefined;
  if (!current) throw new OpError("not_found", `${op.kind} ${op.id} not found`);

  if (op.op === "update") {
    const prev: Record<string, unknown> = {};
    for (const k of Object.keys(op.patch)) prev[k] = current[k];
    return [{ op: "update", kind: op.kind, id: op.id, patch: prev } as Op];
  }

  // Restore the record first, then whatever was cascaded with it.
  return [
    { op: "create", kind: op.kind, value: current } as Op,
    ...cascadeOf(s, op.kind, op.id).map((c) => ({ op: "create", kind: c.kind, value: c.value }) as Op),
  ];
}

/**
 * Ops that undo `ops` when applied to the snapshot that results from them.
 * Must be called with the snapshot *before* `ops` were applied.
 */
export function invertOps(before: Snapshot, ops: readonly Op[]): Op[] {
  const inverses: Op[][] = [];
  const d = new Draft(before);
  for (const op of ops) {
    inverses.push(invertOne(d.s, op));
    applyOne(d, op);
  }
  return inverses.reverse().flat();
}

/** Primary id an op touches (used for change history). */
export function opTargetId(op: Op): string {
  if (op.kind === "workspace") return "workspace";
  return op.op === "create" ? (op.value as { id: string }).id : op.id;
}
