// Locked-out recovery: creates an owner account, or resets an existing
// account's password and makes it an unblocked owner, directly in the
// database - for when nobody can reach the /ceo page to do it there.
// Prompts for everything (including the Turso URL and token, copied from
// Vercel's Environment Variables page) instead of reading .env, so the
// local app doesn't get switched over to Turso by leftover variables.
// Uses @libsql/client like scripts/apply-migrations.mjs, so it also works
// against the local file: enter file:dev.db as the URL and leave the token blank.
//
// Usage: node scripts/reset-owner.mjs

import { createClient } from "@libsql/client";
import { randomBytes, scryptSync } from "node:crypto";
import readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let muted = false;
// Echo nothing while typing/pasting secrets (ask() writes the prompt itself
// before muting, so it still shows).
rl._writeToOutput = (s) => {
  if (!muted) rl.output.write(s);
};

// Lines are queued as they arrive so pasted/piped input isn't dropped
// between questions.
const queued = [];
const waiting = [];
rl.on("line", (line) => (waiting.length ? waiting.shift()(line) : queued.push(line)));
rl.on("close", () => waiting.forEach((resolve) => resolve("")));

async function ask(question, { hidden = false } = {}) {
  rl.output.write(question);
  muted = hidden;
  const answer = queued.length ? queued.shift() : await new Promise((resolve) => waiting.push(resolve));
  if (hidden) rl.output.write("\n");
  muted = false;
  return answer.replace(/^﻿/, "").trim();
}

const url = await ask("Database URL (libsql://... from Vercel, or file:dev.db for local): ");
const authToken = url.startsWith("file:") ? undefined : await ask("Turso auth token (hidden): ", { hidden: true });
const username = (await ask("Username: ")).toLowerCase(); // stored lowercase, same as login
const password = await ask("New password (hidden): ", { hidden: true });
const confirm = await ask("Type it again (hidden): ", { hidden: true });
rl.close();

if (!url || !username || !password) {
  console.error("URL, username and password are all required.");
  process.exit(1);
}
if (password !== confirm) {
  console.error("Passwords didn't match - nothing was changed.");
  process.exit(1);
}

// Same scheme as hashPassword in src/lib/auth.ts.
const salt = randomBytes(16).toString("hex");
const hash = scryptSync(password, salt, 64).toString("hex");

const client = createClient({ url, authToken });
const existing = await client.execute({ sql: 'SELECT id FROM "User" WHERE username = ?', args: [username] });

if (existing.rows.length > 0) {
  await client.execute({
    sql: 'UPDATE "User" SET passwordHash = ?, passwordSalt = ?, isOwner = 1, isBlocked = 0 WHERE username = ?',
    args: [hash, salt, username],
  });
  console.log(`Reset "${username}" - new password set, owner access on, unblocked.`);
} else {
  await client.execute({
    sql: 'INSERT INTO "User" (id, username, passwordHash, passwordSalt, isOwner) VALUES (?, ?, ?, ?, 1)',
    args: [randomBytes(12).toString("hex"), username, hash, salt],
  });
  console.log(`Created owner account "${username}".`);
}

client.close();
