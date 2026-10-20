/**
 * Database connection.
 *
 *  - DATABASE_URL set   -> a real PostgreSQL server through node-postgres.
 *  - DATABASE_URL empty -> embedded PostgreSQL (PGlite, WASM) persisted in PGLITE_DIR.
 *
 * Both speak the same SQL and run the same migrations, so nothing else in the
 * app knows which one is in use.
 */
import path from "node:path";
import fs from "node:fs";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

export async function openPglite(dataDir?: string): Promise<{ db: Db; close: () => Promise<void> }> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return { db: db as unknown as Db, close: () => client.close() };
}

export async function openPostgres(url: string): Promise<{ db: Db; close: () => Promise<void> }> {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const pool = new Pool({ connectionString: url, max: 10 });
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return { db: db as unknown as Db, close: () => pool.end() };
}

// One connection per server process. Kept on globalThis so dev hot-reloads
// don't open the embedded database twice (PGlite allows a single opener).
const g = globalThis as unknown as { __mindspaceDb?: Promise<{ db: Db; close: () => Promise<void> }> };

export function getDb(): Promise<Db> {
  if (!g.__mindspaceDb) {
    const url = process.env.DATABASE_URL?.trim();
    g.__mindspaceDb = url
      ? openPostgres(url)
      : openPglite(path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.PGLITE_DIR?.trim() || ".data/pglite"));
    g.__mindspaceDb.catch(() => {
      g.__mindspaceDb = undefined;
    });
  }
  return g.__mindspaceDb.then((c) => c.db);
}
