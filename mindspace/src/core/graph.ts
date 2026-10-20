/**
 * Graph queries over the semantic layer only (entities + relationships).
 * Nothing here looks at placements or colours.
 */
import type { Entity, EntityType, Relationship, RelationshipCategory, RelationshipType, Snapshot } from "./model";

export interface Adjacency {
  /** entityId -> relationships touching it (either end). */
  byEntity: Map<string, Relationship[]>;
}

export function buildAdjacency(relationships: Iterable<Relationship>): Adjacency {
  const byEntity = new Map<string, Relationship[]>();
  const push = (id: string, r: Relationship) => {
    const list = byEntity.get(id);
    if (list) list.push(r);
    else byEntity.set(id, [r]);
  };
  for (const r of relationships) {
    push(r.sourceId, r);
    if (r.targetId !== r.sourceId) push(r.targetId, r);
  }
  return { byEntity };
}

export function otherEnd(r: Relationship, entityId: string): string {
  return r.sourceId === entityId ? r.targetId : r.sourceId;
}

export interface RelationshipFilter {
  /** Only follow relationships whose type id is in this set (all when undefined). */
  typeIds?: ReadonlySet<string>;
}

function passes(r: Relationship, f?: RelationshipFilter) {
  return !f?.typeIds || f.typeIds.has(r.typeId);
}

export interface Neighborhood {
  /** entityId -> distance from the root (root = 0). */
  entities: Map<string, number>;
  relationshipIds: Set<string>;
}

/** Breadth-first neighbourhood up to `depth` hops, ignoring direction. */
export function neighborhood(
  adj: Adjacency,
  rootIds: readonly string[],
  depth: number,
  filter?: RelationshipFilter,
): Neighborhood {
  const entities = new Map<string, number>();
  const relationshipIds = new Set<string>();
  let frontier = rootIds.filter((id) => !entities.has(id));
  for (const id of frontier) entities.set(id, 0);
  for (let d = 1; d <= depth && frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const r of adj.byEntity.get(id) ?? []) {
        if (!passes(r, filter)) continue;
        relationshipIds.add(r.id);
        const o = otherEnd(r, id);
        if (!entities.has(o)) {
          entities.set(o, d);
          next.push(o);
        }
      }
    }
    frontier = next;
  }
  // Include relationships between entities already in the set (closes triangles).
  for (const id of entities.keys())
    for (const r of adj.byEntity.get(id) ?? [])
      if (passes(r, filter) && entities.has(r.sourceId) && entities.has(r.targetId)) relationshipIds.add(r.id);
  return { entities, relationshipIds };
}

/** Shortest undirected path; returns entity ids and relationship ids, or null. */
export function shortestPath(
  adj: Adjacency,
  fromId: string,
  toId: string,
  filter?: RelationshipFilter,
): { entityIds: string[]; relationshipIds: string[] } | null {
  if (fromId === toId) return { entityIds: [fromId], relationshipIds: [] };
  const prev = new Map<string, { via: Relationship; from: string }>();
  const seen = new Set([fromId]);
  let frontier = [fromId];
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const r of adj.byEntity.get(id) ?? []) {
        if (!passes(r, filter)) continue;
        const o = otherEnd(r, id);
        if (seen.has(o)) continue;
        seen.add(o);
        prev.set(o, { via: r, from: id });
        if (o === toId) {
          const entityIds = [toId];
          const relationshipIds: string[] = [];
          let cur = toId;
          while (cur !== fromId) {
            const p = prev.get(cur)!;
            relationshipIds.unshift(p.via.id);
            entityIds.unshift(p.from);
            cur = p.from;
          }
          return { entityIds, relationshipIds };
        }
        next.push(o);
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * Categories along which a disruption propagates, and in which direction.
 * "upstream" means: if the *target* fails, the *source* is affected
 * (A depends on B → B failing affects A). "downstream" is the reverse.
 */
const IMPACT_RULES: Partial<Record<RelationshipCategory, "toSource" | "toTarget">> = {
  dependency: "toSource", // A depends on B: B late -> A affected
  resource: "toSource", // Project requires Resource: resource missing -> project affected
  hierarchical: "toTarget", // Task part of Project: task late -> project affected
  execution: "toTarget", // Person executes Project: person unavailable -> project affected
  financial: "toTarget", // Budget funds Project: budget cut -> project affected
  ownership: "toTarget",
  influence: "toTarget",
};

/**
 * Entities that may be affected if `rootId` is delayed or disrupted.
 * Each result carries the chain of relationships that justifies it (explainable).
 */
export function impactAnalysis(
  snapshot: Snapshot,
  rootId: string,
  maxDepth = 6,
): Array<{ entityId: string; depth: number; via: string[] }> {
  const adj = buildAdjacency(Object.values(snapshot.relationships));
  const result: Array<{ entityId: string; depth: number; via: string[] }> = [];
  const seen = new Set([rootId]);
  let frontier: Array<{ id: string; via: string[] }> = [{ id: rootId, via: [] }];
  for (let d = 1; d <= maxDepth && frontier.length; d++) {
    const next: typeof frontier = [];
    for (const { id, via } of frontier) {
      for (const r of adj.byEntity.get(id) ?? []) {
        const cat = snapshot.relationshipTypes[r.typeId]?.category;
        const rule = cat ? IMPACT_RULES[cat] : undefined;
        if (!rule) continue;
        // The disruption flows from `id` to the affected end.
        const affected = rule === "toSource" ? (r.targetId === id ? r.sourceId : null) : r.sourceId === id ? r.targetId : null;
        if (!affected || seen.has(affected)) continue;
        seen.add(affected);
        const chain = [...via, r.id];
        result.push({ entityId: affected, depth: d, via: chain });
        next.push({ id: affected, via: chain });
      }
    }
    frontier = next;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Small lookup helpers
// ---------------------------------------------------------------------------

export function typeByKey<T extends EntityType | RelationshipType>(types: Record<string, T>, key: string): T | undefined {
  for (const t of Object.values(types)) if (t.key === key) return t;
  return undefined;
}

export function entitiesOfTypeKeys(s: Snapshot, keys: readonly string[]): Entity[] {
  const ids = new Set(Object.values(s.entityTypes).filter((t) => keys.includes(t.key)).map((t) => t.id));
  return Object.values(s.entities).filter((e) => ids.has(e.typeId));
}
