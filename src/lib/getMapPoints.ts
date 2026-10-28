import { prisma } from "@/lib/db";
import { getCounty } from "@/lib/counties";
import { toISODate } from "@/lib/dates";
import { isLikelyHoaOrLienCase } from "@/lib/caseType";
import { estimatePropertyValue } from "@/lib/valuation";
import { getCachedCoordinates, type Coordinates } from "@/lib/geocode";
import type { AuctionListingView } from "@/lib/getAuctionListings";

/** One dot on the homepage map - just enough for its popup, not a full listing view. */
export interface MapPoint {
  id: string;
  address: string;
  countySlug: string;
  countyName: string;
  caseNumber: string;
  auctionDate: string; // YYYY-MM-DD
  judgment: number | null;
  valueEstimate: number | null;
  likelyHoa: boolean;
  /** Null until geocoded - the map asks /api/geocode for these after the page loads. */
  coords: Coordinates | null;
  /** Census already tried and couldn't match this address recently - the map shouldn't ask again. */
  unlocatable: boolean;
}

// Safety cap on how many dots the default map pulls - well past what the
// whole state realistically has scheduled, but keeps a page load bounded.
const MAX_UPCOMING_POINTS = 6000;
// A case the county site no longer lists (cancelled, settled, sold early)
// never gets its row deleted - its scrapedAt just stops moving. The
// scheduled refresh (src/lib/refreshCounties.ts) re-confirms every listed
// case at least daily, so anything not re-confirmed in this long has most
// likely dropped off the county's calendar and shouldn't be a dot.
const STALE_AFTER_DAYS = 4;

/**
 * Every upcoming auction already in the database, across all counties -
 * what the homepage map shows before any search. Deliberately reads only
 * what's stored (no scraping, no RentCast): the scheduled statewide refresh
 * is what keeps the database covering every county.
 */
export async function getUpcomingMapPoints(): Promise<MapPoint[]> {
  const rows = await prisma.listing.findMany({
    where: {
      auctionDate: { gte: new Date(toISODate(new Date())) },
      propertyAddress: { not: null },
      scrapedAt: { gte: new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000) },
    },
    orderBy: { auctionDate: "asc" },
    take: MAX_UPCOMING_POINTS,
  });

  // A rescheduled case can leave more than one upcoming row for the same
  // property - one dot, for its nearest date.
  const byAddress = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!byAddress.has(row.propertyAddress!) && getCounty(row.countySlug)) byAddress.set(row.propertyAddress!, row);
  }
  const unique = [...byAddress.values()];

  const estimates = await prisma.valueEstimateCache.findMany({
    where: { address: { in: [...byAddress.keys()] }, failed: false },
  });
  const estimateByAddress = new Map(estimates.map((e) => [e.address, e]));

  const points = unique.map((row): Omit<MapPoint, "coords" | "unlocatable"> => {
    const market = estimateByAddress.get(row.propertyAddress!);
    const value = estimatePropertyValue({
      assessedValue: row.assessedValueAtSale,
      market: market ? { ...market, compCount: market.compCount ?? 0 } : null,
    });
    return {
      id: `${row.countySlug}:${row.caseNumber}`,
      address: row.propertyAddress!,
      countySlug: row.countySlug,
      countyName: getCounty(row.countySlug)!.name,
      caseNumber: row.caseNumber,
      auctionDate: toISODate(row.auctionDate),
      judgment: row.finalJudgmentAmount,
      valueEstimate: value.amount,
      likelyHoa: isLikelyHoaOrLienCase(row.caseNumber),
    };
  });
  return attachCoordinates(points);
}

/** The same dots for a set of search results, so the map shows exactly what the results grid below it does. */
export async function listingsToMapPoints(listings: AuctionListingView[]): Promise<MapPoint[]> {
  const seen = new Set<string>();
  const points: Omit<MapPoint, "coords" | "unlocatable">[] = [];
  for (const listing of listings) {
    if (!listing.propertyAddress || seen.has(listing.propertyAddress)) continue;
    seen.add(listing.propertyAddress);
    points.push({
      id: `${listing.countySlug}:${listing.caseNumber}`,
      address: listing.propertyAddress,
      countySlug: listing.countySlug,
      countyName: listing.countyName,
      caseNumber: listing.caseNumber,
      auctionDate: listing.auctionDate,
      judgment: listing.finalJudgmentAmount,
      valueEstimate: listing.valueEstimate.amount,
      likelyHoa: isLikelyHoaOrLienCase(listing.caseNumber),
    });
  }
  return attachCoordinates(points);
}

async function attachCoordinates(points: Omit<MapPoint, "coords" | "unlocatable">[]): Promise<MapPoint[]> {
  const { found, unlocatable } = await getCachedCoordinates(points.map((p) => p.address));
  return points.map((p) => ({ ...p, coords: found.get(p.address) ?? null, unlocatable: unlocatable.has(p.address) }));
}
