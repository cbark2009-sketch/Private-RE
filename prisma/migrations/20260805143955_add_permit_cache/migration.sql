-- CreateTable
CREATE TABLE "PermitCache" (
    "countySlug" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("countySlug", "parcelId")
);
