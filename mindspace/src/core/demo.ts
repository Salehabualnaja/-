/**
 * The mandatory test scenario (section 16 of the brief), as plain Ops.
 * Loaded only on request, into its own canvas, never into the user's empty board.
 */
import { makeCanvas, makeEntity, makePlacement, makeRelationship, newId, nowIso, type Snapshot } from "./model";
import type { Op } from "./ops";
import { typeByKey } from "./graph";

export const DEMO_CANVAS_NAME = "سيناريو تجريبي: صندوق الاستثمار";

export interface DemoIds {
  canvasId: string;
  entities: Record<
    | "dimension"
    | "domain"
    | "program"
    | "project1"
    | "task"
    | "ahmad"
    | "khaled"
    | "legal"
    | "budget"
    | "project2",
    string
  >;
  relationships: Record<
    | "domainInDimension"
    | "programInDomain"
    | "project1InProgram"
    | "taskInProject1"
    | "ahmadOwnsProject1"
    | "ahmadAdvisesProject2"
    | "khaledExecutesProject1"
    | "budgetFundsProject1"
    | "project1NeedsLegal"
    | "project2NeedsLegal",
    string
  >;
}

export function demoScenarioOps(s: Snapshot, sortOrder = 100): { ops: Op[]; ids: DemoIds } {
  const et = (key: string) => {
    const t = typeByKey(s.entityTypes, key);
    if (!t) throw new Error(`نوع الكيان «${key}» غير موجود. أعد إنشاءه من الإعدادات لتحميل السيناريو.`);
    return t.id;
  };
  const rt = (key: string) => {
    const t = typeByKey(s.relationshipTypes, key);
    if (!t) throw new Error(`نوع العلاقة «${key}» غير موجود. أعد إنشاءه من الإعدادات لتحميل السيناريو.`);
    return t.id;
  };
  const at = nowIso();
  const canvas = makeCanvas({ name: DEMO_CANVAS_NAME, sortOrder, viewport: { x: 200, y: 80, zoom: 0.8 } });

  const E = {
    dimension: makeEntity({ typeId: et("dimension"), title: "العمل", createdAt: at }),
    domain: makeEntity({ typeId: et("domain"), title: "الاستثمار", createdAt: at }),
    program: makeEntity({ typeId: et("program"), title: "النمو والتوسع", status: "active", createdAt: at }),
    project1: makeEntity({
      typeId: et("project"),
      title: "تأسيس صندوق استثماري",
      status: "active",
      priority: "high",
      properties: { budget: 500000 },
      createdAt: at,
    }),
    task: makeEntity({ typeId: et("task"), title: "إعداد دراسة الجدوى", status: "active", properties: { progress: 30 }, createdAt: at }),
    ahmad: makeEntity({ typeId: et("person"), title: "أحمد", createdAt: at }),
    khaled: makeEntity({ typeId: et("person"), title: "خالد", createdAt: at }),
    legal: makeEntity({ typeId: et("resource"), title: "مستشار قانوني", properties: { availability: "limited" }, createdAt: at }),
    budget: makeEntity({
      typeId: et("financial"),
      title: "ميزانية التأسيس",
      properties: { amount: 250000, kind: "budget" },
      createdAt: at,
    }),
    project2: makeEntity({ typeId: et("project"), title: "إنشاء شركة استشارية", status: "planned", createdAt: at }),
  };

  const rel = (typeKey: string, source: keyof typeof E, target: keyof typeof E, extra: Partial<Parameters<typeof makeRelationship>[0]> = {}) =>
    makeRelationship({ typeId: rt(typeKey), sourceId: E[source].id, targetId: E[target].id, createdAt: at, ...extra });

  const R = {
    domainInDimension: rel("hierarchical", "domain", "dimension"),
    programInDomain: rel("hierarchical", "program", "domain"),
    project1InProgram: rel("hierarchical", "project1", "program"),
    taskInProject1: rel("hierarchical", "task", "project1"),
    ahmadOwnsProject1: rel("ownership", "ahmad", "project1", {
      properties: { role: "مسؤول عن الإطار النظامي للصندوق", contribution: "جزء من المشروع" },
    }),
    ahmadAdvisesProject2: rel("people", "ahmad", "project2", { properties: { role: "مستشار" } }),
    khaledExecutesProject1: rel("execution", "khaled", "project1", { properties: { role: "منفّذ", progress: 20 } }),
    budgetFundsProject1: rel("financial", "budget", "project1", {
      properties: { amount: 250000, currency: "SAR", commitment: "planned" },
    }),
    project1NeedsLegal: rel("resource", "project1", "legal", { properties: { requirement: "needed" } }),
    project2NeedsLegal: rel("resource", "project2", "legal", { properties: { requirement: "needed" } }),
  };

  // Layout: hierarchy on the right column (RTL reading), people & resources around the projects.
  const pos: Record<keyof typeof E, [number, number]> = {
    dimension: [900, 0],
    domain: [900, 160],
    program: [900, 320],
    project1: [560, 480],
    project2: [80, 480],
    task: [900, 640],
    ahmad: [320, 260],
    khaled: [620, 760],
    legal: [320, 760],
    budget: [600, 220],
  };

  const ops: Op[] = [{ op: "create", kind: "canvas", value: canvas }];
  for (const e of Object.values(E)) ops.push({ op: "create", kind: "entity", value: e });
  for (const r of Object.values(R)) ops.push({ op: "create", kind: "relationship", value: r });
  for (const [k, [x, y]] of Object.entries(pos))
    ops.push({
      op: "create",
      kind: "placement",
      value: makePlacement({ id: newId(), canvasId: canvas.id, entityId: E[k as keyof typeof E].id, x, y }),
    });

  const ids: DemoIds = {
    canvasId: canvas.id,
    entities: Object.fromEntries(Object.entries(E).map(([k, v]) => [k, v.id])) as DemoIds["entities"],
    relationships: Object.fromEntries(Object.entries(R).map(([k, v]) => [k, v.id])) as DemoIds["relationships"],
  };
  return { ops, ids };
}
