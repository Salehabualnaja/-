/**
 * Performance benchmark for the brief's initial target: 1,000 entities and
 * 3,000 relationships. Measures the pure core (reducer, undo inversion, graph
 * queries, dashboards, search) and the database layer (PGlite, in memory).
 *
 *   npm run bench                  # core + database
 *   npm run bench -- --seed URL    # additionally push the dataset to a running app (e.g. http://localhost:3100)
 */
import { performance } from "node:perf_hooks";
import { makeCanvas, makeEntity, makePlacement, makeRelationship, emptySnapshot, newId, type Snapshot } from "../src/core/model";
import { applyOps, invertOps, type Op } from "../src/core/ops";
import { DEFAULT_SETTINGS, presetOps } from "../src/core/presets";
import { buildAdjacency, impactAnalysis, neighborhood, shortestPath, typeByKey } from "../src/core/graph";
import { financialDashboard, peopleDashboard, portfolioDashboard, resourceDashboard } from "../src/core/queries";
import { searchEntities } from "../src/core/search";
import { openPglite } from "../src/server/db/client";
import { applyBatch, ensureWorkspace, loadSnapshot } from "../src/server/repository";

const ENTITIES = 1000;
const RELATIONSHIPS = 3000;

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/** Deterministic synthetic graph placed on its own canvas. */
export function syntheticOps(base: Snapshot, seed = 42): Op[] {
  const rand = rng(seed);
  const typeKeys = ["project", "task", "person", "resource", "financial", "goal", "idea", "risk"];
  const types = typeKeys.map((k) => typeByKey(base.entityTypes, k)!.id);
  const relTypes = Object.values(base.relationshipTypes).map((t) => t.id);
  const canvas = makeCanvas({ name: `أداء: ${ENTITIES} كيان و${RELATIONSHIPS} علاقة`, sortOrder: 999 });
  const ops: Op[] = [{ op: "create", kind: "canvas", value: canvas }];
  const ids: string[] = [];
  const cols = Math.ceil(Math.sqrt(ENTITIES));
  // Grouped by kind, as an importer would send them (lets the server batch INSERTs).
  for (let i = 0; i < ENTITIES; i++) {
    const e = makeEntity({ typeId: types[i % types.length], title: `كيان رقم ${i + 1}`, properties: { amount: Math.round(rand() * 100000) } });
    ids.push(e.id);
    ops.push({ op: "create", kind: "entity", value: e });
  }
  ids.forEach((entityId, i) =>
    ops.push({ op: "create", kind: "placement", value: makePlacement({ canvasId: canvas.id, entityId, x: (i % cols) * 300, y: Math.floor(i / cols) * 180 }) }),
  );
  for (let i = 0; i < RELATIONSHIPS; i++) {
    const a = Math.floor(rand() * ENTITIES);
    // Mostly local links (like real projects), some long-range ones.
    const b = rand() < 0.8 ? Math.min(ENTITIES - 1, a + 1 + Math.floor(rand() * cols)) : Math.floor(rand() * ENTITIES);
    if (a === b) continue;
    ops.push({
      op: "create",
      kind: "relationship",
      value: makeRelationship({ typeId: relTypes[Math.floor(rand() * relTypes.length)], sourceId: ids[a], targetId: ids[b] }),
    });
  }
  return ops;
}

function time<T>(label: string, fn: () => T, results: Array<[string, number]>): T {
  const t0 = performance.now();
  const out = fn();
  results.push([label, performance.now() - t0]);
  return out;
}

async function timeAsync<T>(label: string, fn: () => Promise<T>, results: Array<[string, number]>): Promise<T> {
  const t0 = performance.now();
  const out = await fn();
  results.push([label, performance.now() - t0]);
  return out;
}

async function main() {
  const results: Array<[string, number]> = [];
  const base = applyOps(emptySnapshot({ id: "bench", name: "bench", settings: DEFAULT_SETTINGS }), presetOps());
  const ops = syntheticOps(base);
  const s = time(`core: applyOps (${ops.length} ops)`, () => applyOps(base, ops), results);
  const relCount = Object.keys(s.relationships).length;
  time("core: invertOps for the same batch (undo)", () => invertOps(base, ops), results);
  const e0 = Object.keys(s.entities)[0];
  const p0 = Object.values(s.placements)[0];
  time("core: single card move (apply + invert)", () => {
    const op: Op = { op: "update", kind: "placement", id: p0.id, patch: { x: 1, y: 1 } };
    invertOps(s, [op]);
    return applyOps(s, [op]);
  }, results);
  const adj = time("core: build adjacency index", () => buildAdjacency(Object.values(s.relationships)), results);
  time("core: neighbourhood depth 3", () => neighborhood(adj, [e0], 3), results);
  const ids = Object.keys(s.entities);
  time("core: shortest path (random pair)", () => shortestPath(adj, ids[3], ids[ids.length - 5]), results);
  time("core: impact analysis", () => impactAnalysis(s, e0), results);
  time("core: people dashboard", () => peopleDashboard(s), results);
  time("core: resource dashboard", () => resourceDashboard(s), results);
  time("core: financial dashboard", () => financialDashboard(s), results);
  time("core: portfolio dashboard", () => portfolioDashboard(s), results);
  time("core: search", () => searchEntities(s, "كيان رقم 77"), results);

  const { db, close } = await openPglite();
  await ensureWorkspace(db, "bench");
  const dbBase = await loadSnapshot(db, "bench");
  const dbOps = syntheticOps(dbBase);
  await timeAsync(`db: apply batch (${dbOps.length} ops, one transaction)`, () => applyBatch(db, "bench", newId(), dbOps), results);
  const loaded = await timeAsync("db: load full snapshot", () => loadSnapshot(db, "bench"), results);
  const pl = Object.values(loaded.placements)[0];
  await timeAsync("db: single card move", () => applyBatch(db, "bench", newId(), [{ op: "update", kind: "placement", id: pl.id, patch: { x: 5, y: 5 } }]), results);
  await close();

  const json = JSON.stringify(loaded);
  console.log(`\nDataset: ${Object.keys(s.entities).length} entities, ${relCount} relationships, ${Object.keys(s.placements).length} placements`);
  console.log(`Snapshot JSON size: ${(json.length / 1024).toFixed(0)} KiB\n`);
  for (const [label, ms] of results) console.log(`${ms.toFixed(1).padStart(9)} ms  ${label}`);

  const seedIdx = process.argv.indexOf("--seed");
  if (seedIdx > 0) {
    const url = process.argv[seedIdx + 1];
    const remote = (await (await fetch(`${url}/api/workspace`)).json()) as Snapshot;
    const res = await fetch(`${url}/api/ops`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ batchId: newId(), ops: syntheticOps(remote) }),
    });
    console.log(`\nSeeded ${url}: HTTP ${res.status}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
