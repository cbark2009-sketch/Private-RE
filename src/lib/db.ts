import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaLibSql } from "@prisma/adapter-libsql";

// Next.js reloads modules on every request in dev, which would normally
// create a new PrismaClient (and a new SQLite connection) each time. Stashing
// it on `globalThis` keeps one instance alive across those reloads.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Local dev keeps using a plain file (better-sqlite3, unchanged). Production
// (Vercel) has no writable local disk, so it points at Turso instead - a
// hosted, network-reachable database that speaks the same SQLite dialect,
// which is why the schema and every query in this app didn't need to change
// at all, just where the file "lives." Presence of TURSO_DATABASE_URL is
// what decides which adapter to use.
const adapter = process.env.TURSO_DATABASE_URL
  ? new PrismaLibSql({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
  : new PrismaBetterSqlite3({
      url: process.env.DATABASE_URL || "file:./dev.db",
    });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
