import { prisma } from "@/lib/db";
import { scrapeAuctionDate } from "@/lib/scrapeAuctions";
import { estimateMaxBid, estimatePropertyValue } from "@/lib/valuation";
import { getMarketEstimate } from "@/lib/getMarketEstimate";
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

export type PriceFilterBasis = "judgment" | "estimate" | "assessed";

export interface PriceFilter {
  basis: PriceFilterBasis;
  min: number;
}

function priceFieldFor(view: Pick<AuctionListingView, "finalJudgmentAmount" | "assessedValue" | "valueEstimate">, basis: PriceFilterBasis): number | null {
  if (basis === "judgment") return view.finalJudgmentAmount;
  if (basis === "assessed") return view.assessedValue;
  return view.valueEstimate.amount;
}

/**
 * Scrapes (or reuses a cached scrape of) an auction date for a given county,
 * computes our two estimates, persists everything, and returns view-ready
 * data. Pass `zipFilter` to narrow to just that zip within the county
 * (a county's auctions can span many zips - this is what makes a zip search
 * actually show that zip's properties instead of the whole county's).
 * Pass `priceFilter` to only include listings whose judgment/estimate/
 * assessed value (whichever `basis` picks) is at least `min` - a listing
 * with no value for the chosen basis (e.g. no RentCast estimate) is excluded
 * rather than guessed at. Throws if countySlug isn't one of our supported
 * counties.
 */
export async function getAuctionListings(
  countySlug: string,
  auctionDate: string,
  zipFilter?: string,
  priceFilter?: PriceFilter
): Promise<AuctionListingView[]> {
  const county = getCounty(countySlug);
  if (!county) throw new Error(`Unsupported county: ${countySlug}`);

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
        getMarketEstimate(row.propertyAddress!).catch((err) => {
          console.error(`Market estimate failed for "${row.propertyAddress}":`, err);
          return null;
        }),
        getPermitsForListing(county.slug, row.parcelId).catch((err) => {
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

  if (!priceFilter) return views;
  return views.filter((v) => {
    const value = priceFieldFor(v, priceFilter.basis);
    return value != null && value >= priceFilter.min;
  });
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
