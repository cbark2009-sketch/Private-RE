import { prisma } from "@/lib/db";
import { scrapeAuctionDate } from "@/lib/scrapeAuctions";
import { estimateMaxBid, estimatePropertyValue } from "@/lib/valuation";
import { getMarketEstimate, getCachedMarketEstimate } from "@/lib/getMarketEstimate";
import { getPermitsForListing, type PermitResult } from "@/lib/permits";
import { getCounty, type County } from "@/lib/counties";

export interface AuctionListingView {
  caseNumber: string;
  caseDetailUrl: string | null;
  auctionDate: string;
  finalJudgmentAmount: number | null;
  estimatedMaxBid: number | null;
  propertyAddress: string | null;
  zipCode: string | null;
  assessedValue: number | null;
  parcelId: string | null;
  parcelUrl: string | null;
  valueEstimate: ReturnType<typeof estimatePropertyValue>;
  permits: PermitResult | null;
}

export interface RangeFilter {
  min?: number;
  max?: number;
}

export interface ListingFilters {
  judgment?: RangeFilter;
  maxBid?: RangeFilter;
  estimate?: RangeFilter;
  assessed?: RangeFilter;
  /** Only listings where valueEstimate.amount / finalJudgmentAmount is at least this - a user-adjustable version of the ratio the homepage's good-deals section uses. */
  minSpreadRatio?: number;
}

function inRange(value: number | null, range: RangeFilter | undefined): boolean {
  if (!range || (range.min == null && range.max == null)) return true; // no constraint on this field
  if (value == null) return false; // constraint set but this listing has no data for it - exclude, don't guess
  if (range.min != null && value < range.min) return false;
  if (range.max != null && value > range.max) return false;
  return true;
}

/** A listing must satisfy every field the caller actually set (AND across fields) - unset fields impose no constraint. */
function matchesFilters(view: AuctionListingView, filters: ListingFilters): boolean {
  if (!inRange(view.finalJudgmentAmount, filters.judgment)) return false;
  if (!inRange(view.estimatedMaxBid, filters.maxBid)) return false;
  if (!inRange(view.valueEstimate.amount, filters.estimate)) return false;
  if (!inRange(view.assessedValue, filters.assessed)) return false;
  if (filters.minSpreadRatio != null) {
    if (view.valueEstimate.amount == null || !view.finalJudgmentAmount) return false;
    if (view.valueEstimate.amount / view.finalJudgmentAmount < filters.minSpreadRatio) return false;
  }
  return true;
}

/**
 * Scrapes (or reuses a cached scrape of) an auction date for a given county,
 * computes our two estimates, persists everything, and returns view-ready
 * data. Pass `zipFilter` to narrow to just that zip within the county
 * (a county's auctions can span many zips - this is what makes a zip search
 * actually show that zip's properties instead of the whole county's).
 * Pass `filters` to apply any combination of judgment/max-bid/estimate/
 * assessed ranges and a minimum estimate-vs-judgment spread ratio at once -
 * a listing missing data for any field that's actually constrained is
 * excluded rather than guessed at. Throws if countySlug isn't one of our
 * supported counties.
 *
 * `options.liveEstimates` (default true) controls whether a never-before-seen
 * address gets a real RentCast lookup or just whatever's already cached
 * (same as `false` here). Set `false` for searches that touch many
 * addresses at once (cross-county search) - a live RentCast round-trip per
 * new address is genuinely slow at that scale (a 2-county live search took
 * long enough to need killing before this existed), not just a quota
 * concern. `options.skipPermits` (default false) similarly skips the
 * permit-source lookups for the same kind of broad/bulk search, matching
 * the homepage good-deals section's existing approach.
 */
export async function getAuctionListings(
  countySlug: string,
  auctionDate: string,
  zipFilter?: string,
  filters?: ListingFilters,
  options?: { liveEstimates?: boolean; skipPermits?: boolean }
): Promise<AuctionListingView[]> {
  const county = getCounty(countySlug);
  if (!county) throw new Error(`Unsupported county: ${countySlug}`);
  const liveEstimates = options?.liveEstimates ?? true;
  const skipPermits = options?.skipPermits ?? false;

  const rows = await getOrRefreshRows(county, auctionDate);

  // Cases with no published address (mostly HOA lien / timeshare interest
  // foreclosures, not full property sales - see the "TIMESHARE" label some
  // counties' sites use in place of a parcel ID) can't get a map or a value
  // estimate, so there's nothing useful to show - leave them out rather than
  // displaying empty "Unknown" boxes.
  //
  // Address is the only hard requirement. This used to also require a
  // non-null assessedValueAtSale, back when assessed value was the only
  // source for the value estimate - but now RentCast (keyed off address) is
  // the primary source, so that requirement was stale and had a real bug:
  // Broward's listings never publish an "Assessed Value" field at all, so
  // every single Broward listing was being silently excluded regardless of
  // having a perfectly good address. Assessed value missing now just means
  // that one stat shows "Unknown" - it doesn't hide the whole listing.
  const complete = rows.filter(
    (row) => row.propertyAddress != null && (!zipFilter || row.zipCode === zipFilter)
  );

  const views = await Promise.all(
    complete.map(async (row) => {
      const [market, permits] = await Promise.all([
        (liveEstimates ? getMarketEstimate(row.propertyAddress!) : getCachedMarketEstimate(row.propertyAddress!)).catch(
          (err) => {
            console.error(`Market estimate failed for "${row.propertyAddress}":`, err);
            return null;
          }
        ),
        skipPermits
          ? Promise.resolve(null)
          : getPermitsForListing(county.slug, row.parcelId).catch((err) => {
              console.error(`Permit lookup failed for "${row.propertyAddress}" (parcel ${row.parcelId}):`, err);
              return null;
            }),
      ]);
      return {
        caseNumber: row.caseNumber,
        caseDetailUrl: row.caseDetailUrl,
        auctionDate,
        finalJudgmentAmount: row.finalJudgmentAmount,
        estimatedMaxBid: row.estimatedMaxBid,
        propertyAddress: row.propertyAddress,
        zipCode: row.zipCode,
        assessedValue: row.assessedValueAtSale,
        parcelId: row.parcelId,
        parcelUrl: row.parcelUrl,
        valueEstimate: estimatePropertyValue({ assessedValue: row.assessedValueAtSale, market }),
        permits,
      };
    })
  );

  if (!filters) return views;
  return views.filter((v) => matchesFilters(v, filters));
}

/**
 * Returns the raw DB rows for a (county, date), scraping first if they're
 * missing or stale (>24h old). Exported so callers that only need to *count*
 * or inspect raw fields (e.g. per-day zip counts for the calendar) can reuse
 * the same scrape-and-cache path without paying for `getAuctionListings`'s
 * RentCast lookups on every listing, which would burn quota just to render
 * numbers on a calendar nobody's asked to see valuations for yet.
 */
export async function getOrRefreshRows(county: County, auctionDate: string) {
  const existing = await prisma.listing.findMany({
    where: { countySlug: county.slug, auctionDate: new Date(auctionDate) },
    orderBy: { propertyAddress: "asc" },
  });

  const isStale =
    existing.length === 0 ||
    existing.some((l) => Date.now() - l.scrapedAt.getTime() > 24 * 60 * 60 * 1000);

  return isStale ? await refreshAuctionDate(county, auctionDate) : existing;
}

async function refreshAuctionDate(county: County, auctionDate: string) {
  const raw = await scrapeAuctionDate(county.host, auctionDate);

  const rows = [];
  for (const listing of raw) {
    const row = await prisma.listing.upsert({
      where: {
        countySlug_caseNumber_auctionDate: {
          countySlug: county.slug,
          caseNumber: listing.caseNumber,
          auctionDate: new Date(auctionDate),
        },
      },
      create: {
        countySlug: county.slug,
        auctionDate: new Date(auctionDate),
        caseNumber: listing.caseNumber,
        caseDetailUrl: listing.caseDetailUrl,
        finalJudgmentAmount: listing.finalJudgmentAmount,
        estimatedMaxBid: estimateMaxBid(listing.finalJudgmentAmount),
        propertyAddress: listing.propertyAddress,
        zipCode: listing.zipCode,
        assessedValueAtSale: listing.assessedValue,
        parcelId: listing.parcelId,
        parcelUrl: listing.parcelUrl,
      },
      update: {
        finalJudgmentAmount: listing.finalJudgmentAmount,
        estimatedMaxBid: estimateMaxBid(listing.finalJudgmentAmount),
        assessedValueAtSale: listing.assessedValue,
        zipCode: listing.zipCode,
        scrapedAt: new Date(),
      },
    });
    rows.push(row);
  }
  return rows;
}
