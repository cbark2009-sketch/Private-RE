-- CreateTable
-- IF NOT EXISTS because src/lib/taxDeeds.ts also creates this same table and
-- its indexes on first use (see src/lib/ensureTable.ts) - applying this
-- afterwards must be a harmless no-op, not an error.
CREATE TABLE IF NOT EXISTS "TaxDeedListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "countySlug" TEXT NOT NULL,
    "auctionDate" DATETIME NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "caseDetailUrl" TEXT,
    "certificateNumber" TEXT,
    "openingBid" REAL,
    "propertyAddress" TEXT,
    "zipCode" TEXT,
    "assessedValue" REAL,
    "parcelId" TEXT,
    "parcelUrl" TEXT,
    "scrapedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TaxDeedListing_countySlug_caseNumber_auctionDate_key" ON "TaxDeedListing"("countySlug", "caseNumber", "auctionDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TaxDeedListing_countySlug_auctionDate_idx" ON "TaxDeedListing"("countySlug", "auctionDate");
