-- CreateTable
-- IF NOT EXISTS because src/lib/propertyDetails.ts also creates this same
-- table on first use (see src/lib/ensureTable.ts) - applying this afterwards
-- must be a harmless no-op, not an error.
CREATE TABLE IF NOT EXISTS "PropertyDetailsCache" (
    "address" TEXT NOT NULL PRIMARY KEY,
    "data" TEXT,
    "failed" BOOLEAN NOT NULL DEFAULT false,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
