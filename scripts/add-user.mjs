// Chat-driven account provisioning - run by Claude when the owner asks to
// add someone, not a self-serve signup form (see project history for why:
// this app is for a handful of people the owner knows personally). Reuses
// the app's own Prisma client (src/lib/db.ts), which already points at
// Turso in production / the local file in dev via the same env-var switch
// every other part of the app uses - no separate DB connection needed here,
// unlike scripts/apply-migrations.mjs (which has to bypass Prisma because
// its *migration* tooling specifically can't target a remote libSQL URL;
// regular queries through the generated client don't have that limitation).
//
// Usage: node --env-file=.env scripts/add-user.mjs <username> [--owner]

import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/db.ts";
import { hashPassword } from "../src/lib/auth.ts";

const username = process.argv[2];
const isOwner = process.argv.includes("--owner");

if (!username) {
  console.error("Usage: node --env-file=.env scripts/add-user.mjs <username> [--owner]");
  process.exit(1);
}

const password = randomBytes(9).toString("base64url"); // ~12 URL-safe chars, no ambiguous symbols
const { hash, salt } = hashPassword(password);

const user = await prisma.user.create({
  data: { username, passwordHash: hash, passwordSalt: salt, isOwner },
});

console.log(`Created user "${user.username}"${isOwner ? " (owner)" : ""}.`);
console.log(`Password: ${password}`);
console.log("This is shown once - save it now, it's not stored anywhere in plain text.");

await prisma.$disconnect();
