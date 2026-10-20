/**
 * Persistence tests against a real PostgreSQL engine (PGlite, in memory or on disk).
 * The central property: after any batch, the server snapshot equals what the
 * client reducer computed optimistically.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openPglite, type Db } from "@/server/db/client";
import { applyBatch, ensureWorkspace, listChanges, loadSnapshot } from "@/server/repository";
import { applyOps, invertOps, OpError, type Op } from "@/core/ops";
import { demoScenarioOps } from "@/core/demo";
import { makeEntity, makePlacement, newId } from "@/core/model";
import { typeByKey } from "@/core/graph";
import { peopleDashboard } from "@/core/queries";

let db: Db;
let close: () => Promise<void>;
const WS = "test-ws";

beforeAll(async () => {
  ({ db, close } = await openPglite());
  await ensureWorkspace(db, WS);
});
afterAll(async () => close());

async function roundTrip(ops: Op[]) {
  const before = await loadSnapshot(db, WS);
  const expected = applyOps(before, ops);
  await applyBatch(db, WS, newId(), ops);
  const actual = await loadSnapshot(db, WS);
  expect(actual).toEqual(expected);
  return { before, after: actual };
}

describe("repository", () => {
  it("bootstraps an empty workspace with presets and one empty canvas, idempotently", async () => {
    await ensureWorkspace(db, WS);
    const s = await loadSnapshot(db, WS);
    expect(Object.keys(s.entities)).toHaveLength(0);
    expect(Object.values(s.canvases)).toHaveLength(1);
    expect(typeByKey(s.entityTypes, "person")).toBeDefined();
    expect(typeByKey(s.relationshipTypes, "financial")).toBeDefined();
    expect(Object.values(s.fields).length).toBeGreaterThan(10);
  });

  it("persists the demo scenario exactly as the client reducer computes it", async () => {
    const s = await loadSnapshot(db, WS);
    const { ops, ids } = demoScenarioOps(s);
    const { after } = await roundTrip(ops);
    const ahmad = peopleDashboard(after).people.filter((p) => p.person.id === ids.entities.ahmad);
    expect(ahmad).toHaveLength(1);
    expect(ahmad[0].projectCount).toBe(2);
  });

  it("round-trips updates, moves, deletes and their undo", async () => {
    const s = await loadSnapshot(db, WS);
    const ahmad = Object.values(s.entities).find((e) => e.title === "أحمد")!;
    const placement = Object.values(s.placements).find((p) => p.entityId === ahmad.id)!;
    const updates: Op[] = [
      { op: "update", kind: "entity", id: ahmad.id, patch: { description: "شريك", tags: ["مستشار"], dueDate: "2026-12-31" } },
      { op: "update", kind: "placement", id: placement.id, patch: { x: 12.5, y: -40 } },
    ];
    const { before } = await roundTrip(updates);
    await roundTrip(invertOps(before, updates));

    const del: Op[] = [{ op: "delete", kind: "entity", id: ahmad.id }];
    const r = await roundTrip(del);
    expect(Object.values(r.after.relationships).some((x) => x.sourceId === ahmad.id)).toBe(false);
    await roundTrip(invertOps(r.before, del)); // undo restores entity + relationships + placement
    const restored = await loadSnapshot(db, WS);
    expect(restored).toEqual(r.before);
  });

  it("removing a placement keeps the entity and its placements on other canvases", async () => {
    const s = await loadSnapshot(db, WS);
    const khaled = Object.values(s.entities).find((e) => e.title === "خالد")!;
    const mainCanvas = Object.values(s.canvases).find((c) => c.name === "اللوحة الرئيسية")!;
    const second = makePlacement({ canvasId: mainCanvas.id, entityId: khaled.id, x: 0, y: 0 });
    await roundTrip([{ op: "create", kind: "placement", value: second }]);
    const first = Object.values(s.placements).find((p) => p.entityId === khaled.id)!;
    const { after } = await roundTrip([{ op: "delete", kind: "placement", id: first.id }]);
    expect(after.entities[khaled.id]).toBeDefined();
    expect(after.placements[second.id]).toBeDefined();
  });

  it("rejects an invalid batch atomically", async () => {
    const before = await loadSnapshot(db, WS);
    const idea = typeByKey(before.entityTypes, "idea")!;
    const ok = makeEntity({ typeId: idea.id, title: "لن تُحفظ" });
    await expect(
      applyBatch(db, WS, newId(), [
        { op: "create", kind: "entity", value: ok },
        { op: "update", kind: "entity", id: "missing", patch: { title: "x" } },
      ]),
    ).rejects.toBeInstanceOf(OpError);
    expect(await loadSnapshot(db, WS)).toEqual(before);
  });

  it("maps database constraints to the reducer's error codes", async () => {
    const s = await loadSnapshot(db, WS);
    const person = typeByKey(s.entityTypes, "person")!;
    const err = await applyBatch(db, WS, newId(), [{ op: "delete", kind: "entityType", id: person.id }]).catch((e) => e);
    expect(err).toBeInstanceOf(OpError);
    expect((err as OpError).code).toBe("in_use");
    const e = Object.values(s.entities)[0];
    const dupPlacement = Object.values(s.placements).find((p) => p.entityId === e.id)!;
    const err2 = await applyBatch(db, WS, newId(), [
      { op: "create", kind: "placement", value: { ...dupPlacement, id: newId() } },
    ]).catch((x) => x);
    expect((err2 as OpError).code).toBe("exists");
  });

  it("is idempotent for retried batches", async () => {
    const s = await loadSnapshot(db, WS);
    const idea = typeByKey(s.entityTypes, "idea")!;
    const batchId = newId();
    const ops: Op[] = [{ op: "create", kind: "entity", value: makeEntity({ typeId: idea.id, title: "مرة واحدة" }) }];
    expect((await applyBatch(db, WS, batchId, ops)).duplicate).toBe(false);
    expect((await applyBatch(db, WS, batchId, ops)).duplicate).toBe(true);
    const after = await loadSnapshot(db, WS);
    expect(Object.values(after.entities).filter((e) => e.title === "مرة واحدة")).toHaveLength(1);
  });

  it("records a change history per record", async () => {
    const s = await loadSnapshot(db, WS);
    const task = Object.values(s.entities).find((e) => e.title === "إعداد دراسة الجدوى")!;
    await applyBatch(db, WS, newId(), [{ op: "update", kind: "entity", id: task.id, patch: { status: "done" } }]);
    const history = await listChanges(db, WS, [task.id]);
    expect(history.map((h) => h.op)).toEqual(["update", "create"]);
    expect(history[0].payload).toMatchObject({ patch: { status: "done" } });
  });
});

describe("on-disk persistence", () => {
  it("survives closing and reopening the database", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mindspace-"));
    try {
      const a = await openPglite(dir);
      await ensureWorkspace(a.db, "w");
      const s = await loadSnapshot(a.db, "w");
      await applyBatch(a.db, "w", newId(), demoScenarioOps(s).ops);
      const saved = await loadSnapshot(a.db, "w");
      await a.close();

      const b = await openPglite(dir);
      expect(await loadSnapshot(b.db, "w")).toEqual(saved);
      await b.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
