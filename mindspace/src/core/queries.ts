/**
 * Dashboard queries: derived intelligence computed from the knowledge graph.
 *
 * Every figure is traceable: rows carry the relationship ids they rest on
 * (`basis`) and an `origin`:
 *   - "recorded": stored as-is by the user (an entity, a relationship, a value),
 *   - "derived":  computed deterministically from recorded data (counts, totals, gaps).
 * Suggestions from AI (Phase 5) will use a third origin, "suggested", and are
 * never mixed with these.
 *
 * Which entity types count as "people", "projects", etc. is configuration
 * (type keys), not hard-coded business logic.
 */
import type { Entity, Relationship, RelationshipCategory, RelationshipType, Snapshot } from "./model";
import { buildAdjacency, otherEnd } from "./graph";

export type Origin = "recorded" | "derived";

export interface DashboardConfig {
  personTypeKeys: string[];
  projectTypeKeys: string[];
  resourceTypeKeys: string[];
  financialTypeKeys: string[];
  goalTypeKeys: string[];
  decisionTypeKeys: string[];
  riskTypeKeys: string[];
  taskTypeKeys: string[];
}

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  personTypeKeys: ["person"],
  projectTypeKeys: ["project", "program"],
  resourceTypeKeys: ["resource"],
  financialTypeKeys: ["financial"],
  goalTypeKeys: ["goal"],
  decisionTypeKeys: ["decision"],
  riskTypeKeys: ["risk"],
  taskTypeKeys: ["task", "milestone"],
};

export interface Link {
  entity: Entity;
  relationship: Relationship;
  relationshipType: RelationshipType | undefined;
  /** Role read from the relationship record (property `role`, else its label, else its type name). */
  role: string;
  /** Whether the role was recorded explicitly or fell back to the type name. */
  roleOrigin: Origin;
}

function typeIdsFor(s: Snapshot, keys: readonly string[]): Set<string> {
  return new Set(Object.values(s.entityTypes).filter((t) => keys.includes(t.key)).map((t) => t.id));
}

function entitiesIn(s: Snapshot, typeIds: Set<string>): Entity[] {
  return Object.values(s.entities)
    .filter((e) => typeIds.has(e.typeId))
    .sort((a, b) => a.title.localeCompare(b.title, "ar"));
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function linkFor(s: Snapshot, r: Relationship, other: Entity): Link {
  const t = s.relationshipTypes[r.typeId];
  const explicit = str(r.properties.role) || str(r.label);
  return {
    entity: other,
    relationship: r,
    relationshipType: t,
    role: explicit || t?.name || "",
    roleOrigin: explicit ? "recorded" : "derived",
  };
}

function linksBetween(
  s: Snapshot,
  entity: Entity,
  otherTypeIds: Set<string>,
  categories?: readonly RelationshipCategory[],
  adj = buildAdjacency(Object.values(s.relationships)),
): Link[] {
  const out: Link[] = [];
  for (const r of adj.byEntity.get(entity.id) ?? []) {
    const cat = s.relationshipTypes[r.typeId]?.category;
    if (categories && (!cat || !categories.includes(cat))) continue;
    const other = s.entities[otherEnd(r, entity.id)];
    if (other && otherTypeIds.has(other.typeId)) out.push(linkFor(s, r, other));
  }
  return out;
}

// ---------------------------------------------------------------------------
// People intelligence
// ---------------------------------------------------------------------------

export interface PeopleDashboard {
  people: Array<{
    person: Entity;
    links: Link[];
    /** Distinct projects the person is linked to (derived). */
    projectCount: number;
    sharedAcrossProjects: boolean;
  }>;
  /** Projects no person is linked to (derived). */
  projectsWithoutPeople: Entity[];
  /** Person↔project relationships with no explicit role recorded: worth following up (derived). */
  linksMissingRole: Array<{ person: Entity; link: Link }>;
}

export function peopleDashboard(s: Snapshot, cfg: DashboardConfig = DEFAULT_DASHBOARD_CONFIG): PeopleDashboard {
  const adj = buildAdjacency(Object.values(s.relationships));
  const personTypes = typeIdsFor(s, cfg.personTypeKeys);
  const projectTypes = typeIdsFor(s, cfg.projectTypeKeys);
  const linkedProjects = new Set<string>();
  const linksMissingRole: PeopleDashboard["linksMissingRole"] = [];

  const people = entitiesIn(s, personTypes).map((person) => {
    const links = linksBetween(s, person, projectTypes, undefined, adj);
    const distinct = new Set(links.map((l) => l.entity.id));
    distinct.forEach((id) => linkedProjects.add(id));
    for (const link of links) if (link.roleOrigin === "derived") linksMissingRole.push({ person, link });
    return { person, links, projectCount: distinct.size, sharedAcrossProjects: distinct.size > 1 };
  });

  return {
    people,
    projectsWithoutPeople: entitiesIn(s, projectTypes).filter((p) => !linkedProjects.has(p.id)),
    linksMissingRole,
  };
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export interface ResourceDashboard {
  resources: Array<{
    resource: Entity;
    /** Entities that need / use this resource, with the requirement status recorded on the relationship. */
    consumers: Array<Link & { requirement: string | null }>;
    shared: boolean;
    availability: string | null;
  }>;
  /** Requirements marked "needed" whose resource is not recorded as available (derived). */
  uncovered: Array<{ resource: Entity; consumer: Entity; relationship: Relationship }>;
}

export function resourceDashboard(s: Snapshot, cfg: DashboardConfig = DEFAULT_DASHBOARD_CONFIG): ResourceDashboard {
  const adj = buildAdjacency(Object.values(s.relationships));
  const resourceTypes = typeIdsFor(s, cfg.resourceTypeKeys);
  const anyType = new Set(Object.keys(s.entityTypes));
  const uncovered: ResourceDashboard["uncovered"] = [];

  const resources = entitiesIn(s, resourceTypes).map((resource) => {
    const consumers = linksBetween(s, resource, anyType, ["resource"], adj).map((l) => ({
      ...l,
      requirement: str(l.relationship.properties.requirement) || null,
    }));
    const availability = str(resource.properties.availability) || null;
    for (const c of consumers)
      if (c.requirement === "needed" && availability !== "available")
        uncovered.push({ resource, consumer: c.entity, relationship: c.relationship });
    return { resource, consumers, shared: new Set(consumers.map((c) => c.entity.id)).size > 1, availability };
  });

  return { resources, uncovered };
}

// ---------------------------------------------------------------------------
// Financial intelligence
// ---------------------------------------------------------------------------

export interface FinancialDashboard {
  items: Array<{
    item: Entity;
    amount: number | null;
    currency: string;
    kind: string | null;
    links: Array<Link & { amount: number | null; currency: string; commitment: string | null }>;
  }>;
  /** Sum of recorded item amounts per kind and currency (derived). */
  totals: Array<{ kind: string; currency: string; total: number; count: number }>;
  /** Projects with no financial relationship at all (derived). */
  projectsWithoutFinancials: Entity[];
  /** Projects whose recorded budget exceeds the funding linked to them (derived). */
  fundingGaps: Array<{ project: Entity; budget: number; linked: number; gap: number; basis: string[] }>;
}

export function financialDashboard(s: Snapshot, cfg: DashboardConfig = DEFAULT_DASHBOARD_CONFIG): FinancialDashboard {
  const adj = buildAdjacency(Object.values(s.relationships));
  const finTypes = typeIdsFor(s, cfg.financialTypeKeys);
  const projectTypes = typeIdsFor(s, cfg.projectTypeKeys);
  const anyType = new Set(Object.keys(s.entityTypes));
  const fieldCurrency = (typeId: string, key: string) =>
    Object.values(s.fields).find((f) => f.entityTypeId === typeId && f.key === key)?.options.currency ?? "";

  const items = entitiesIn(s, finTypes).map((item) => {
    const currency = str(item.properties.currency) || fieldCurrency(item.typeId, "amount");
    const links = linksBetween(s, item, anyType, ["financial"], adj).map((l) => ({
      ...l,
      amount: num(l.relationship.properties.amount),
      currency: str(l.relationship.properties.currency) || currency,
      commitment: str(l.relationship.properties.commitment) || null,
    }));
    return { item, amount: num(item.properties.amount), currency, kind: str(item.properties.kind) || null, links };
  });

  const totalsMap = new Map<string, { kind: string; currency: string; total: number; count: number }>();
  for (const it of items) {
    if (it.amount === null) continue;
    const k = `${it.kind ?? ""}|${it.currency}`;
    const t = totalsMap.get(k) ?? { kind: it.kind ?? "", currency: it.currency, total: 0, count: 0 };
    t.total += it.amount;
    t.count++;
    totalsMap.set(k, t);
  }

  const projects = entitiesIn(s, projectTypes);
  const projectsWithoutFinancials = projects.filter(
    (p) => linksBetween(s, p, anyType, ["financial"], adj).length === 0,
  );

  const fundingGaps: FinancialDashboard["fundingGaps"] = [];
  for (const p of projects) {
    const budget = num(p.properties.budget);
    if (budget === null) continue;
    const links = linksBetween(s, p, finTypes, ["financial"], adj);
    let linked = 0;
    for (const l of links) linked += num(l.relationship.properties.amount) ?? num(l.entity.properties.amount) ?? 0;
    if (linked < budget)
      fundingGaps.push({ project: p, budget, linked, gap: budget - linked, basis: links.map((l) => l.relationship.id) });
  }

  return { items, totals: [...totalsMap.values()], projectsWithoutFinancials, fundingGaps };
}

// ---------------------------------------------------------------------------
// Portfolio & strategy
// ---------------------------------------------------------------------------

export interface PortfolioDashboard {
  projectsByStatus: Array<{ status: string | null; projects: Entity[] }>;
  overdue: Entity[];
  /** Entities that many others depend on (derived from dependency relationships). */
  criticalDependencies: Array<{ entity: Entity; dependents: Entity[]; basis: string[] }>;
  risks: Entity[];
  goalsWithoutProjects: Entity[];
  projectsWithoutGoals: Entity[];
  openDecisions: Entity[];
}

export function portfolioDashboard(
  s: Snapshot,
  cfg: DashboardConfig = DEFAULT_DASHBOARD_CONFIG,
  today = new Date().toISOString().slice(0, 10),
): PortfolioDashboard {
  const adj = buildAdjacency(Object.values(s.relationships));
  const projects = entitiesIn(s, typeIdsFor(s, cfg.projectTypeKeys));
  const goals = entitiesIn(s, typeIdsFor(s, cfg.goalTypeKeys));
  const goalTypes = typeIdsFor(s, cfg.goalTypeKeys);
  const projectTypes = typeIdsFor(s, cfg.projectTypeKeys);

  const byStatus = new Map<string | null, Entity[]>();
  for (const p of projects) byStatus.set(p.status, [...(byStatus.get(p.status) ?? []), p]);

  const workTypes = typeIdsFor(s, [...cfg.taskTypeKeys, ...cfg.projectTypeKeys]);
  const overdue = Object.values(s.entities).filter(
    (e) => workTypes.has(e.typeId) && e.dueDate !== null && e.dueDate < today && e.status !== "done",
  );

  const dependents = new Map<string, { ents: Set<string>; basis: string[] }>();
  for (const r of Object.values(s.relationships)) {
    if (s.relationshipTypes[r.typeId]?.category !== "dependency") continue;
    const d = dependents.get(r.targetId) ?? { ents: new Set(), basis: [] };
    d.ents.add(r.sourceId);
    d.basis.push(r.id);
    dependents.set(r.targetId, d);
  }
  const criticalDependencies = [...dependents.entries()]
    .filter(([, d]) => d.ents.size >= 2)
    .map(([id, d]) => ({
      entity: s.entities[id],
      dependents: [...d.ents].map((x) => s.entities[x]).filter(Boolean),
      basis: d.basis,
    }))
    .filter((x) => x.entity)
    .sort((a, b) => b.dependents.length - a.dependents.length);

  return {
    projectsByStatus: [...byStatus.entries()].map(([status, ps]) => ({ status, projects: ps })),
    overdue,
    criticalDependencies,
    risks: entitiesIn(s, typeIdsFor(s, cfg.riskTypeKeys)),
    goalsWithoutProjects: goals.filter((g) => linksBetween(s, g, projectTypes, undefined, adj).length === 0),
    projectsWithoutGoals: projects.filter((p) => linksBetween(s, p, goalTypes, undefined, adj).length === 0),
    openDecisions: entitiesIn(s, typeIdsFor(s, cfg.decisionTypeKeys)).filter(
      (d) => d.status !== "done" && !str(d.properties.finalDecision),
    ),
  };
}

// ---------------------------------------------------------------------------
// Entity briefing (Decision intelligence: "what do I need to know about this project?")
// ---------------------------------------------------------------------------

export interface EntityBriefing {
  byCategory: Array<{ category: RelationshipCategory; links: Link[] }>;
  /** Other entities of the same types sharing at least one resource with this one (derived). */
  sharesResourcesWith: Array<{ entity: Entity; via: Entity[] }>;
}

export function entityBriefing(s: Snapshot, entityId: string): EntityBriefing {
  const adj = buildAdjacency(Object.values(s.relationships));
  const entity = s.entities[entityId];
  if (!entity) return { byCategory: [], sharesResourcesWith: [] };
  const all = new Set(Object.keys(s.entityTypes));
  const links = linksBetween(s, entity, all, undefined, adj);
  const groups = new Map<RelationshipCategory, Link[]>();
  for (const l of links) {
    const cat = l.relationshipType?.category ?? "custom";
    groups.set(cat, [...(groups.get(cat) ?? []), l]);
  }
  const shares = new Map<string, Entity[]>();
  for (const l of links) {
    if (l.relationshipType?.category !== "resource") continue;
    for (const r of adj.byEntity.get(l.entity.id) ?? []) {
      if (s.relationshipTypes[r.typeId]?.category !== "resource") continue;
      const other = otherEnd(r, l.entity.id);
      if (other === entityId || !s.entities[other]) continue;
      shares.set(other, [...(shares.get(other) ?? []), l.entity]);
    }
  }
  return {
    byCategory: [...groups.entries()].map(([category, ls]) => ({ category, links: ls })),
    sharesResourcesWith: [...shares.entries()].map(([id, via]) => ({ entity: s.entities[id], via })),
  };
}
