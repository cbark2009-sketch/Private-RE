-- CreateTable
-- IF NOT EXISTS because src/lib/refreshCounties.ts also creates this same
-- table on first use (see src/lib/ensureTable.ts) - applying this afterwards
-- must be a harmless no-op, not an error.
CREATE TABLE IF NOT EXISTS "CountyRefresh" (
    "countySlug" TEXT NOT NULL PRIMARY KEY,
    "refreshedAt" DATETIME NOT NULL,
    "listingCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT
);
