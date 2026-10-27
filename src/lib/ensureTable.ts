import { prisma } from "@/lib/db";

/**
 * Production's Turso database only gets schema changes when someone runs
 * scripts/apply-migration.mjs by hand. Self-contained cache tables (nothing
 * else references them) get created on first use instead, so a feature that
 * adds one works on the very next deploy with no manual step. Pass the same
 * `CREATE TABLE IF NOT EXISTS` SQL as that table's migration, which must
 * also use IF NOT EXISTS so neither path can conflict with the other.
 *
 * Runs once per server instance per table; a failure lets the next call
 * try again rather than caching the error.
 */
const ready = new Map<string, Promise<unknown>>();

export function ensureTable(createTableSql: string): Promise<unknown> {
  let pending = ready.get(createTableSql);
  if (!pending) {
    pending = prisma.$executeRawUnsafe(createTableSql).catch((err) => {
      ready.delete(createTableSql);
      throw err;
    });
    ready.set(createTableSql, pending);
  }
  return pending;
}
