-- CreateTable
-- IF NOT EXISTS because src/lib/floridaParcel.ts and src/lib/zillowFacts.ts
-- also create these same tables on first use (see src/lib/ensureTable.ts) -
-- applying this afterwards must be a harmless no-op, not an error.
CREATE TABLE IF NOT EXISTS "ParcelRecordCache" (
    "address" TEXT NOT NULL PRIMARY KEY,
    "data" TEXT,
    "failed" BOOLEAN NOT NULL DEFAULT false,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ZillowCache" (
    "address" TEXT NOT NULL PRIMARY KEY,
    "data" TEXT,
    "failed" BOOLEAN NOT NULL DEFAULT false,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
