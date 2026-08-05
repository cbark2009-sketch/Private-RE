// One-time setup script: applies every local migration.sql file to a Turso
// database, in order. Exists because the Turso CLI requires WSL on Windows
// - this uses the plain JS @libsql/client instead, so no CLI/WSL install is
// needed, just Node (which you already have).
//
// Usage: node --env-file=.env scripts/apply-migrations.mjs
// Requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to be set (put them in
// .env temporarily, same names Vercel will use in production).

import { createClient } from "@libsql/client";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(projectRoot, "prisma", "migrations");

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN. Add them to .env first, then run with:\n  node --env-file=.env scripts/apply-migrations.mjs");
  process.exit(1);
}

const migrationFolders = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort(); // folder names are timestamp-prefixed, so this is chronological

const client = createClient({ url, authToken });

for (const folder of migrationFolders) {
  const sql = readFileSync(join(migrationsDir, folder, "migration.sql"), "utf8");
  console.log(`Applying ${folder}...`);
  await client.executeMultiple(sql);
}

console.log(`Done - applied ${migrationFolders.length} migration(s) to Turso.`);
client.close();
