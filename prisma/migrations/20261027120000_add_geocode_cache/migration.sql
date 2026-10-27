-- CreateTable
-- IF NOT EXISTS because src/lib/geocode.ts also creates this same table on
-- first use (so production works without a manual Turso migration step) -
-- applying this afterwards must be a harmless no-op, not an error.
CREATE TABLE IF NOT EXISTS "GeocodeCache" (
    "address" TEXT NOT NULL PRIMARY KEY,
    "lat" REAL,
    "lng" REAL,
    "failed" BOOLEAN NOT NULL DEFAULT false,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
