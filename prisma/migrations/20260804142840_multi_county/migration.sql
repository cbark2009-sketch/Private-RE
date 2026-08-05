-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "countySlug" TEXT NOT NULL,
    "auctionDate" DATETIME NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "caseDetailUrl" TEXT,
    "finalJudgmentAmount" REAL,
    "estimatedMaxBid" REAL,
    "propertyAddress" TEXT,
    "assessedValueAtSale" REAL,
    "parcelId" TEXT,
    "parcelUrl" TEXT,
    "scrapedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ValueEstimateCache" (
    "address" TEXT NOT NULL PRIMARY KEY,
    "price" REAL,
    "priceRangeLow" REAL,
    "priceRangeHigh" REAL,
    "squareFootage" REAL,
    "compAvgPricePerSqft" REAL,
    "compCount" INTEGER,
    "failed" BOOLEAN NOT NULL DEFAULT false,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Listing_countySlug_auctionDate_idx" ON "Listing"("countySlug", "auctionDate");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_countySlug_caseNumber_auctionDate_key" ON "Listing"("countySlug", "caseNumber", "auctionDate");
