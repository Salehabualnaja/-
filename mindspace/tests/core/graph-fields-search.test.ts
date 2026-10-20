import { describe, expect, it } from "vitest";
import { buildAdjacency, neighborhood, shortestPath } from "@/core/graph";
import { changeFieldTypeOps, coerceValue, countLossyValues, LEGACY_KEY, slugKey } from "@/core/fields";
import { makeEntity, makeRelationship, type FieldDefinition } from "@/core/model";
import { applyOps, invertOps } from "@/core/ops";
import { normalizeText, searchEntities } from "@/core/search";
import { demoScenarioOps } from "@/core/demo";
import { presetSnapshot } from "./helpers";

describe("graph", () => {
  // a - b - c - d, and e isolated; x-type link a - d
  const rel = (id: string, s: string, t: string, typeId = "t1") =>
    makeRelationship({ id, typeId, sourceId: s, targetId: t });
  const rels = [rel("ab", "a", "b"), rel("bc", "b", "c"), rel("cd", "c", "d"), rel("ad", "a", "d", "t2")];
  const adj = buildAdjacency(rels);

  it("neighborhood respects depth and relationship filters", () => {
    expect([...neighborhood(adj, ["a"], 1).entities.keys()].sort()).toEqual(["a", "b", "d"]);
    const filtered = neighborhood(adj, ["a"], 1, { typeIds: new Set(["t1"]) });
    expect([...filtered.entities.keys()].sort()).toEqual(["a", "b"]);
    const two = neighborhood(adj, ["a"], 2, { typeIds: new Set(["t1"]) });
    expect(two.entities.get("c")).toBe(2);
    expect([...two.relationshipIds].sort()).toEqual(["ab", "bc"]);
  });

  it("shortest path returns the chain of relationships", () => {
    expect(shortestPath(adj, "a", "c")).toEqual({ entityIds: ["a", "b", "c"], relationshipIds: ["ab", "bc"] });
    expect(shortestPath(adj, "a", "d")?.relationshipIds).toEqual(["ad"]);
    expect(shortestPath(adj, "a", "d", { typeIds: new Set(["t1"]) })?.relationshipIds).toEqual(["ab", "bc", "cd"]);
    expect(shortestPath(adj, "a", "e")).toBeNull();
  });
});

describe("fields", () => {
  it("coerces values between data types", () => {
    expect(coerceValue("١٬٢٠٠", "number")).toEqual({ ok: true, value: 1200 });
    expect(coerceValue("abc", "number")).toEqual({ ok: false });
    expect(coerceValue(42, "text")).toEqual({ ok: true, value: "42" });
    expect(coerceValue("نعم", "checkbox")).toEqual({ ok: true, value: true });
    expect(coerceValue("2026-03-01T10:00:00Z", "date")).toEqual({ ok: true, value: "2026-03-01" });
    const opts = { options: { choices: [{ value: "hi", label: "عالٍ" }] } };
    expect(coerceValue("عالٍ", "select", opts)).toEqual({ ok: true, value: "hi" });
    expect(coerceValue("other", "select", opts)).toEqual({ ok: false });
    expect(coerceValue("", "number")).toEqual({ ok: true, value: undefined });
  });

  it("changing a field type migrates values and preserves unconvertible ones", () => {
    const s = presetSnapshot();
    const person = Object.values(s.entityTypes).find((t) => t.key === "person")!;
    const field = Object.values(s.fields).find((f) => f.entityTypeId === person.id && f.key === "phone")!;
    const good = makeEntity({ typeId: person.id, properties: { phone: "0555" } });
    const bad = makeEntity({ typeId: person.id, properties: { phone: "غير معروف" } });
    const s1 = applyOps(s, [
      { op: "create", kind: "entity", value: good },
      { op: "create", kind: "entity", value: bad },
    ]);
    const ops = changeFieldTypeOps(field, { dataType: "number", options: {} }, { entities: Object.values(s1.entities) }, "2026-01-01T00:00:00Z");
    expect(countLossyValues(field, { dataType: "number", options: {} }, { entities: Object.values(s1.entities) })).toBe(1);
    const s2 = applyOps(s1, ops);
    expect((s2.fields[field.id] as FieldDefinition).dataType).toBe("number");
    expect(s2.entities[good.id].properties.phone).toBe(555);
    expect(s2.entities[bad.id].properties.phone).toBeUndefined();
    expect((s2.entities[bad.id].properties[LEGACY_KEY] as Record<string, { value: unknown }>).phone.value).toBe("غير معروف");
    // The whole migration is undoable.
    expect(applyOps(s2, invertOps(s1, ops))).toEqual(s1);
  });

  it("generates unique keys from labels", () => {
    expect(slugKey("تاريخ البدء", [])).toBe("تاريخ_البدء");
    expect(slugKey("Budget", ["budget"])).toBe("budget_2");
  });
});

describe("search", () => {
  it("normalises Arabic spelling variants", () => {
    expect(normalizeText("إعداد دراسةُ الجدوى")).toBe(normalizeText("اعداد دراسه الجدوي"));
  });

  it("finds entities by partial, normalised title", () => {
    const s0 = presetSnapshot();
    const s = applyOps(s0, demoScenarioOps(s0).ops);
    expect(searchEntities(s, "احمد")[0].entity.title).toBe("أحمد");
    expect(searchEntities(s, "دراسه")[0].entity.title).toBe("إعداد دراسة الجدوى");
    expect(searchEntities(s, "غير موجود")).toEqual([]);
  });
});
