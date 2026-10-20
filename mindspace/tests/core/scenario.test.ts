/**
 * The mandatory scenario from section 16 of the brief, checked end to end
 * against the real reducer and dashboard queries.
 */
import { describe, expect, it } from "vitest";
import { demoScenarioOps } from "@/core/demo";
import { makeCanvas, makePlacement } from "@/core/model";
import { applyOps } from "@/core/ops";
import { financialDashboard, peopleDashboard, resourceDashboard, entityBriefing } from "@/core/queries";
import { impactAnalysis } from "@/core/graph";
import { presetSnapshot } from "./helpers";

function loaded() {
  const s0 = presetSnapshot();
  const { ops, ids } = demoScenarioOps(s0);
  return { s: applyOps(s0, ops), ids };
}

describe("demo scenario", () => {
  it("People dashboard lists Ahmad once, with his roles in both projects", () => {
    const { s, ids } = loaded();
    const dash = peopleDashboard(s);
    const ahmads = dash.people.filter((p) => p.person.id === ids.entities.ahmad);
    expect(ahmads).toHaveLength(1);
    const ahmad = ahmads[0];
    expect(ahmad.projectCount).toBe(2);
    expect(ahmad.sharedAcrossProjects).toBe(true);
    const roles = Object.fromEntries(ahmad.links.map((l) => [l.entity.id, l.role]));
    expect(roles[ids.entities.project2]).toBe("مستشار");
    expect(roles[ids.entities.project1]).toContain("مسؤول");
    const khaled = dash.people.find((p) => p.person.id === ids.entities.khaled)!;
    expect(khaled.links.map((l) => l.relationshipType?.category)).toEqual(["execution"]);
  });

  it("Resource dashboard shows both projects need the legal advisor", () => {
    const { s, ids } = loaded();
    const dash = resourceDashboard(s);
    const legal = dash.resources.find((r) => r.resource.id === ids.entities.legal)!;
    expect(new Set(legal.consumers.map((c) => c.entity.id))).toEqual(
      new Set([ids.entities.project1, ids.entities.project2]),
    );
    expect(legal.shared).toBe(true);
    // Availability is "limited", so both "needed" requirements are uncovered (derived).
    expect(dash.uncovered).toHaveLength(2);
  });

  it("Financial dashboard shows the budget linked to the first project", () => {
    const { s, ids } = loaded();
    const dash = financialDashboard(s);
    const budget = dash.items.find((i) => i.item.id === ids.entities.budget)!;
    expect(budget.links.map((l) => l.entity.id)).toEqual([ids.entities.project1]);
    expect(budget.links[0].amount).toBe(250000);
    expect(dash.totals).toEqual([{ kind: "budget", currency: "SAR", total: 250000, count: 1 }]);
    const unfunded = dash.projectsWithoutFinancials.map((p) => p.id);
    expect(unfunded).toContain(ids.entities.project2);
    expect(unfunded).not.toContain(ids.entities.project1);
    // Project 1 records a 500k budget, 250k linked: a derived funding gap traceable to its relationship.
    const gap = dash.fundingGaps.find((g) => g.project.id === ids.entities.project1)!;
    expect(gap.gap).toBe(250000);
    expect(gap.basis).toEqual([ids.relationships.budgetFundsProject1]);
  });

  it("changing Ahmad's role in one project changes only that relationship record", () => {
    const { s, ids } = loaded();
    const relId = ids.relationships.ahmadAdvisesProject2;
    const rel = s.relationships[relId];
    const s2 = applyOps(s, [
      { op: "update", kind: "relationship", id: relId, patch: { properties: { ...rel.properties, role: "شريك مؤسس" } } },
    ]);
    for (const id of Object.keys(s.relationships)) {
      if (id === relId) expect(s2.relationships[id].properties.role).toBe("شريك مؤسس");
      else expect(s2.relationships[id]).toBe(s.relationships[id]);
    }
    expect(s2.entities).toBe(s.entities);
  });

  it("moving Ahmad's card changes neither his role nor any relationship", () => {
    const { s, ids } = loaded();
    const p = Object.values(s.placements).find((x) => x.entityId === ids.entities.ahmad)!;
    const s2 = applyOps(s, [{ op: "update", kind: "placement", id: p.id, patch: { x: p.x + 400, y: p.y - 90 } }]);
    expect(s2.relationships).toBe(s.relationships);
    expect(s2.entities).toBe(s.entities);
  });

  it("removing Ahmad's card from one canvas keeps him in the system and on other canvases", () => {
    const { s, ids } = loaded();
    const other = makeCanvas({ name: "لوحة أخرى" });
    const onOther = makePlacement({ canvasId: other.id, entityId: ids.entities.ahmad, x: 0, y: 0 });
    const s2 = applyOps(s, [
      { op: "create", kind: "canvas", value: other },
      { op: "create", kind: "placement", value: onOther },
    ]);
    const demoPlacement = Object.values(s2.placements).find(
      (x) => x.entityId === ids.entities.ahmad && x.canvasId === ids.canvasId,
    )!;
    const s3 = applyOps(s2, [{ op: "delete", kind: "placement", id: demoPlacement.id }]);
    expect(s3.entities[ids.entities.ahmad]).toBeDefined();
    expect(s3.placements[onOther.id]).toBeDefined();
    expect(peopleDashboard(s3).people.find((x) => x.person.id === ids.entities.ahmad)!.projectCount).toBe(2);
  });

  it("a person exists once even when shown on several canvases", () => {
    const { s, ids } = loaded();
    const ahmads = Object.values(s.entities).filter((e) => e.title === "أحمد");
    expect(ahmads.map((e) => e.id)).toEqual([ids.entities.ahmad]);
  });

  it("impact analysis traces delays from the task up the hierarchy", () => {
    const { s, ids } = loaded();
    const impact = impactAnalysis(s, ids.entities.task);
    const affected = impact.map((i) => i.entityId);
    expect(affected).toContain(ids.entities.project1);
    expect(affected).toContain(ids.entities.program);
    const viaProgram = impact.find((i) => i.entityId === ids.entities.program)!;
    expect(viaProgram.via).toEqual([ids.relationships.taskInProject1, ids.relationships.project1InProgram]);
    // The legal advisor being unavailable affects both projects.
    const legalImpact = impactAnalysis(s, ids.entities.legal).map((i) => i.entityId);
    expect(legalImpact).toEqual(expect.arrayContaining([ids.entities.project1, ids.entities.project2]));
  });

  it("project briefing finds projects sharing a resource", () => {
    const { s, ids } = loaded();
    const b = entityBriefing(s, ids.entities.project1);
    expect(b.sharesResourcesWith.map((x) => x.entity.id)).toEqual([ids.entities.project2]);
    const cats = b.byCategory.map((c) => c.category).sort();
    expect(cats).toEqual(["execution", "financial", "hierarchical", "ownership", "resource"]);
  });
});
