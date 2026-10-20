/**
 * Server-side persistence: load a workspace snapshot and apply op batches
 * transactionally. The database enforces the same invariants as the client
 * reducer (foreign keys, cascades, unique placement per canvas, one owner per
 * field), so a batch either commits completely or not at all.
 */
import { and, desc, eq, inArray, or } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Db } from "./db/client";
import * as t from "./db/schema";
import { makeCanvas, newId, type Snapshot, type Workspace, type WorkspaceSettings } from "@/core/model";
import { OpError, opTargetId, type Op, type RecordKind } from "@/core/ops";
import { DEFAULT_SETTINGS, presetOps } from "@/core/presets";

export const DEFAULT_WORKSPACE_ID = "default";

const TABLES: Record<RecordKind, PgTable & { id: typeof t.entities.id; workspaceId: typeof t.entities.workspaceId }> = {
  entityType: t.entityTypes,
  field: t.fieldDefinitions,
  relationshipType: t.relationshipTypes,
  entity: t.entities,
  relationship: t.relationships,
  canvas: t.canvases,
  placement: t.placements,
  annotation: t.annotations,
} as never;

const DATE_COLUMNS = new Set(["createdAt", "updatedAt"]);

/** Domain record (ISO strings) -> row values (Date objects for timestamp columns). */
function toRow(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = DATE_COLUMNS.has(k) && typeof v === "string" ? new Date(v) : v;
  return out;
}

/** Row -> domain record. */
function fromRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "workspaceId") continue;
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out as T;
}

function byId<T extends { id: string }>(rows: T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const r of rows) out[r.id] = r;
  return out;
}

/**
 * Create the single-user default workspace with preset types and one empty
 * canvas, if it does not exist yet. Safe to call concurrently.
 */
export async function ensureWorkspace(db: Db, id = DEFAULT_WORKSPACE_ID, name = "مساحتي"): Promise<string> {
  const existing = await db.select({ id: t.workspaces.id }).from(t.workspaces).where(eq(t.workspaces.id, id));
  if (existing.length) return id;
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(t.workspaces)
      .values({ id, name, settings: DEFAULT_SETTINGS })
      .onConflictDoNothing()
      .returning({ id: t.workspaces.id });
    if (!inserted.length) return; // another request won the race
    const canvas = makeCanvas({ name: "اللوحة الرئيسية" });
    await applyOpsInTx(tx as unknown as Db, id, newId(), [...presetOps(), { op: "create", kind: "canvas", value: canvas }]);
  });
  return id;
}

export async function loadSnapshot(db: Db, workspaceId: string): Promise<Snapshot> {
  const [ws] = await db.select().from(t.workspaces).where(eq(t.workspaces.id, workspaceId));
  if (!ws) throw new OpError("not_found", `workspace ${workspaceId} not found`);
  const [entityTypes, fields, relationshipTypes, entities, relationships, canvases, placements, annotations] =
    await Promise.all([
      db.select().from(t.entityTypes).where(eq(t.entityTypes.workspaceId, workspaceId)),
      db.select().from(t.fieldDefinitions).where(eq(t.fieldDefinitions.workspaceId, workspaceId)),
      db.select().from(t.relationshipTypes).where(eq(t.relationshipTypes.workspaceId, workspaceId)),
      db.select().from(t.entities).where(eq(t.entities.workspaceId, workspaceId)),
      db.select().from(t.relationships).where(eq(t.relationships.workspaceId, workspaceId)),
      db.select().from(t.canvases).where(eq(t.canvases.workspaceId, workspaceId)),
      db.select().from(t.placements).where(eq(t.placements.workspaceId, workspaceId)),
      db.select().from(t.annotations).where(eq(t.annotations.workspaceId, workspaceId)),
    ]);
  const map = <T extends { id: string }>(rows: Record<string, unknown>[]) => byId(rows.map((r) => fromRow<T>(r)));
  return {
    workspace: { id: ws.id, name: ws.name, settings: ws.settings as WorkspaceSettings } satisfies Workspace,
    entityTypes: map(entityTypes),
    fields: map(fields),
    relationshipTypes: map(relationshipTypes),
    entities: map(entities),
    relationships: map(relationships),
    canvases: map(canvases),
    placements: map(placements),
    annotations: map(annotations),
  };
}

/** Postgres error -> OpError with the same codes the client reducer uses. */
function translatePgError(err: unknown, op: Op): never {
  const e = err as { code?: string; cause?: { code?: string } };
  const code = e?.code ?? e?.cause?.code;
  if (code === "23503" || code === "23001")
    throw new OpError(op.op === "delete" ? "in_use" : "invalid_ref", `${op.kind}: reference violation`);
  if (code === "23505") throw new OpError(op.op === "create" ? "exists" : "conflict", `${op.kind}: duplicate`);
  if (code === "23514" || code === "23502") throw new OpError("invalid_ref", `${op.kind}: constraint violation`);
  throw err;
}

async function applyOneInTx(db: Db, workspaceId: string, op: Op) {
  if (op.kind === "workspace") {
    const patch: Record<string, unknown> = {};
    if (op.patch.name !== undefined) patch.name = op.patch.name;
    if (op.patch.settings !== undefined) patch.settings = op.patch.settings;
    if (Object.keys(patch).length) await db.update(t.workspaces).set(patch).where(eq(t.workspaces.id, workspaceId));
    return;
  }
  const table = TABLES[op.kind];
  if (op.op === "create") {
    await db.insert(table).values({ ...toRow(op.value as unknown as Record<string, unknown>), workspaceId });
    return;
  }
  const where = and(eq(table.id, op.id), eq(table.workspaceId, workspaceId));
  const res =
    op.op === "update"
      ? Object.keys(op.patch).length
        ? await db.update(table).set(toRow(op.patch as Record<string, unknown>)).where(where).returning({ id: table.id })
        : await db.select({ id: table.id }).from(table).where(where)
      : await db.delete(table).where(where).returning({ id: table.id });
  if (!res.length) throw new OpError("not_found", `${op.kind} ${op.id} not found`);
}

async function applyOpsInTx(db: Db, workspaceId: string, batchId: string, ops: readonly Op[]) {
  // Consecutive creates of the same kind become one multi-row INSERT (same
  // order, so foreign keys still see their targets); everything else runs one by one.
  for (let i = 0; i < ops.length; ) {
    const op = ops[i];
    if (op.op === "create") {
      let j = i;
      while (j < ops.length && j - i < 500 && ops[j].op === "create" && ops[j].kind === op.kind) j++;
      const rows = ops.slice(i, j).map((o) => ({ ...toRow((o as { value: Record<string, unknown> }).value), workspaceId }));
      try {
        await db.insert(TABLES[op.kind]).values(rows);
      } catch (err) {
        translatePgError(err, op);
      }
      i = j;
      continue;
    }
    try {
      await applyOneInTx(db, workspaceId, op);
    } catch (err) {
      if (err instanceof OpError) throw err;
      translatePgError(err, op);
    }
    i++;
  }
  await db.insert(t.opBatches).values({ id: batchId, workspaceId, opCount: ops.length });
  const events = ops.map((op, seq) => ({
    id: newId(),
    workspaceId,
    batchId,
    seq,
    op: op.op,
    kind: op.kind,
    targetId: opTargetId(op),
    payload: op,
  }));
  for (let i = 0; i < events.length; i += 500) await db.insert(t.changeEvents).values(events.slice(i, i + 500));
}

export interface ApplyResult {
  batchId: string;
  applied: number;
  /** True when this batch had already been applied (client retry). */
  duplicate: boolean;
}

/** Apply a batch atomically. Re-sending an applied batch is a no-op. */
export async function applyBatch(db: Db, workspaceId: string, batchId: string, ops: readonly Op[]): Promise<ApplyResult> {
  const done = await db.select({ id: t.opBatches.id }).from(t.opBatches).where(eq(t.opBatches.id, batchId));
  if (done.length) return { batchId, applied: 0, duplicate: true };
  await db.transaction(async (tx) => applyOpsInTx(tx as unknown as Db, workspaceId, batchId, ops));
  return { batchId, applied: ops.length, duplicate: false };
}

export interface ChangeEventDto {
  id: string;
  at: string;
  op: string;
  kind: string;
  targetId: string;
  batchId: string;
  payload: Op;
}

/** Change history of one record, plus relationships touching it when it is an entity. */
export async function listChanges(db: Db, workspaceId: string, targetIds: string[], limit = 100): Promise<ChangeEventDto[]> {
  if (!targetIds.length) return [];
  const rows = await db
    .select()
    .from(t.changeEvents)
    .where(and(eq(t.changeEvents.workspaceId, workspaceId), inArray(t.changeEvents.targetId, targetIds)))
    .orderBy(desc(t.changeEvents.at), desc(t.changeEvents.seq))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    op: r.op,
    kind: r.kind,
    targetId: r.targetId,
    batchId: r.batchId,
    payload: r.payload as Op,
  }));
}

/** Ids of relationships touching an entity (for its history view). */
export async function relationshipIdsOf(db: Db, workspaceId: string, entityId: string): Promise<string[]> {
  const rows = await db
    .select({ id: t.relationships.id })
    .from(t.relationships)
    .where(
      and(
        eq(t.relationships.workspaceId, workspaceId),
        or(eq(t.relationships.sourceId, entityId), eq(t.relationships.targetId, entityId)),
      ),
    );
  return rows.map((r) => r.id);
}
