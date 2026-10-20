import { describe, expect, it } from "vitest";
import { makeCanvas, makeEntity, makePlacement, makeRelationship } from "@/core/model";
import { applyOps, invertOps, OpError, OpSchema, type Op } from "@/core/ops";
import { typeByKey } from "@/core/graph";
import { presetSnapshot } from "./helpers";

function setup() {
  const s0 = presetSnapshot();
  const idea = typeByKey(s0.entityTypes, "idea")!;
  const custom = typeByKey(s0.relationshipTypes, "custom")!;
  const a = makeEntity({ typeId: idea.id, title: "أ" });
  const b = makeEntity({ typeId: idea.id, title: "ب" });
  const canvas = makeCanvas({ name: "لوحة" });
  const r = makeRelationship({ typeId: custom.id, sourceId: a.id, targetId: b.id });
  const pa = makePlacement({ canvasId: canvas.id, entityId: a.id, x: 0, y: 0 });
  const ops: Op[] = [
    { op: "create", kind: "canvas", value: canvas },
    { op: "create", kind: "entity", value: a },
    { op: "create", kind: "entity", value: b },
    { op: "create", kind: "relationship", value: r },
    { op: "create", kind: "placement", value: pa },
  ];
  return { s0, s1: applyOps(s0, ops), a, b, r, canvas, pa, idea, custom };
}

describe("applyOps", () => {
  it("creates records and enforces references", () => {
    const { s1, a, r, idea } = setup();
    expect(s1.entities[a.id].title).toBe("أ");
    expect(s1.relationships[r.id].sourceId).toBe(a.id);
    const bad = makeRelationship({ typeId: r.typeId, sourceId: a.id, targetId: "missing" });
    expect(() => applyOps(s1, [{ op: "create", kind: "relationship", value: bad }])).toThrow(OpError);
    expect(() =>
      applyOps(s1, [{ op: "create", kind: "entity", value: makeEntity({ id: a.id, typeId: idea.id }) }]),
    ).toThrow(/already exists/);
  });

  it("is atomic: a failing op leaves the input snapshot untouched", () => {
    const { s1, idea } = setup();
    const e = makeEntity({ typeId: idea.id });
    const before = Object.keys(s1.entities).length;
    expect(() =>
      applyOps(s1, [
        { op: "create", kind: "entity", value: e },
        { op: "update", kind: "entity", id: "nope", patch: { title: "x" } },
      ]),
    ).toThrow();
    expect(Object.keys(s1.entities).length).toBe(before);
  });

  it("deleting an entity cascades to its relationships and placements only", () => {
    const { s1, a, b, r, pa } = setup();
    const s2 = applyOps(s1, [{ op: "delete", kind: "entity", id: a.id }]);
    expect(s2.entities[a.id]).toBeUndefined();
    expect(s2.relationships[r.id]).toBeUndefined();
    expect(s2.placements[pa.id]).toBeUndefined();
    expect(s2.entities[b.id]).toBeDefined();
  });

  it("removing a placement never deletes the entity", () => {
    const { s1, a, r, pa } = setup();
    const s2 = applyOps(s1, [{ op: "delete", kind: "placement", id: pa.id }]);
    expect(s2.entities[a.id]).toEqual(s1.entities[a.id]);
    expect(s2.relationships[r.id]).toEqual(s1.relationships[r.id]);
  });

  it("refuses to place the same entity twice on one canvas", () => {
    const { s1, a, canvas } = setup();
    const dup = makePlacement({ canvasId: canvas.id, entityId: a.id, x: 5, y: 5 });
    expect(() => applyOps(s1, [{ op: "create", kind: "placement", value: dup }])).toThrow(/already placed/);
  });

  it("refuses to delete a type that is in use", () => {
    const { s1, idea } = setup();
    expect(() => applyOps(s1, [{ op: "delete", kind: "entityType", id: idea.id }])).toThrow(/in use|used/);
  });
});

describe("invertOps (undo)", () => {
  it("inverts creation, update and cascading deletion exactly", () => {
    const { s0, s1, a, pa, canvas } = setup();
    const scenarios: Op[][] = [
      [{ op: "update", kind: "entity", id: a.id, patch: { title: "جديد", tags: ["x"] } }],
      [{ op: "update", kind: "placement", id: pa.id, patch: { x: 300, y: 120 } }],
      [{ op: "delete", kind: "entity", id: a.id }],
      [{ op: "delete", kind: "canvas", id: canvas.id }],
      [{ op: "update", kind: "workspace", patch: { name: "اسم آخر" } }],
    ];
    for (const ops of scenarios) {
      const after = applyOps(s1, ops);
      const inverse = invertOps(s1, ops);
      expect(applyOps(after, inverse)).toEqual(s1);
    }
    // Undo the whole setup batch returns to the preset snapshot.
    const all = invertOps(s0, [
      { op: "create", kind: "canvas", value: canvas },
    ]);
    expect(all).toEqual([{ op: "delete", kind: "canvas", id: canvas.id }]);
  });

  it("redo after undo reproduces the same state", () => {
    const { s1, a } = setup();
    const ops: Op[] = [{ op: "update", kind: "entity", id: a.id, patch: { status: "active" } }];
    const s2 = applyOps(s1, ops);
    const undone = applyOps(s2, invertOps(s1, ops));
    expect(applyOps(undone, ops)).toEqual(s2);
  });
});

describe("OpSchema", () => {
  it("accepts valid ops and rejects malformed ones", () => {
    const { a, pa } = setup();
    expect(OpSchema.safeParse({ op: "create", kind: "entity", value: a }).success).toBe(true);
    expect(OpSchema.safeParse({ op: "update", kind: "placement", id: pa.id, patch: { x: 1 } }).success).toBe(true);
    expect(OpSchema.safeParse({ op: "update", kind: "placement", id: pa.id, patch: { bogus: 1 } }).success).toBe(false);
    expect(OpSchema.safeParse({ op: "create", kind: "entity", value: { ...a, title: 5 } }).success).toBe(false);
    expect(OpSchema.safeParse({ op: "drop", kind: "entity", id: "x" }).success).toBe(false);
  });
});
