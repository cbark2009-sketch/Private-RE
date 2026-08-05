-- AlterTable
ALTER TABLE "Listing" ADD COLUMN "zipCode" TEXT;

-- CreateIndex
CREATE INDEX "Listing_zipCode_idx" ON "Listing"("zipCode");
