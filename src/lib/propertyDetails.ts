import { prisma } from "@/lib/db";
import { ensureTable } from "@/lib/ensureTable";
import { fetchPropertyRecord, type PropertyDetails } from "@/lib/rentcast";

export type { PropertyDetails } from "@/lib/rentcast";

const CACHE_MAX_AGE_DAYS = 180;
// Same reasoning as getMarketEstimate.ts: an address RentCast has no record
// for will almost certainly still have none next week - don't spend quota
// re-asking on every visit.
const NOT_FOUND_RETRY_AFTER_DAYS = 30;

// Same SQL as the add_property_details_cache migration - see ensureTable.ts.
const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS "PropertyDetailsCache" (
  "address" TEXT NOT NULL PRIMARY KEY,
  "data" TEXT,
  "failed" BOOLEAN NOT NULL DEFAULT false,
  "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

/**
 * Beds/baths/sqft/etc. for one house, for the property page. Costs one
 * RentCast call the first time a given house's page is opened, then reads
 * from cache - only ever called from that page (one house a person chose to
 * look at), never from a grid or the map, so a search can't burn through
 * the monthly quota just by listing houses.
 */
export async function getPropertyDetails(address: string): Promise<PropertyDetails | null> {
  await ensureTable(CREATE_TABLE_SQL);
  const cached = await prisma.propertyDetailsCache.findUnique({ where: { address } });

  if (cached) {
    const ageDays = (Date.now() - cached.fetchedAt.getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays < (cached.failed ? NOT_FOUND_RETRY_AFTER_DAYS : CACHE_MAX_AGE_DAYS)) {
      return cached.failed || !cached.data ? null : (JSON.parse(cached.data) as PropertyDetails);
    }
  }

  const result = await fetchPropertyRecord(address).catch((err) => {
    console.error(`RentCast property lookup threw for "${address}":`, err);
    return null;
  });
  // Couldn't check at all (no key, quota, outage) - fall back to whatever's
  // cached, even if old, and don't record anything.
  if (!result) return cached && !cached.failed && cached.data ? (JSON.parse(cached.data) as PropertyDetails) : null;

  const data = result.status === "found" ? JSON.stringify(result.details) : null;
  await prisma.propertyDetailsCache.upsert({
    where: { address },
    create: { address, data, failed: result.status !== "found" },
    update: { data, failed: result.status !== "found", fetchedAt: new Date() },
  });
  return result.status === "found" ? result.details : null;
}
