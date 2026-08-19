// Applies ONE migration folder to Turso - for schema changes made *after*
// the initial deploy, where prisma/migrations already has older folders
// applied. Running the existing apply-migrations.mjs again would try to
// re-run those too and fail on "table already exists." This script exists
// because Turso doesn't track applied migrations the way a local `prisma
// migrate dev` database does (see project history) - there's no built-in
// "only apply what's new."
//
// Usage: node --env-file=.env scripts/apply-migration.mjs <folder-name>
// Example: node --env-file=.env scripts/apply-migration.mjs 20260819012122_add_user_accounts

import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const folderName = process.argv[2];

if (!folderName) {
  console.error("Usage: node --env-file=.env scripts/apply-migration.mjs <folder-name>");
  process.exit(1);
}

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN. Add them to .env first, then run with:\n  node --env-file=.env scripts/apply-migration.mjs <folder-name>");
  process.exit(1);
}

const sql = readFileSync(join(projectRoot, "prisma", "migrations", folderName, "migration.sql"), "utf8");
const client = createClient({ url, authToken });

console.log(`Applying ${folderName}...`);
await client.executeMultiple(sql);
console.log("Done.");
client.close();
