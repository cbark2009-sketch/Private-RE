import { getAuctionListings, type AuctionListingView, type ListingFilters } from "@/lib/getAuctionListings";
import { getCalendarMonth } from "@/lib/getCalendarMonth";
import { getCounty } from "@/lib/counties";

/** Every date in a given month (YYYY-MM-DD) that the county's own calendar shows as having active auctions. */
export async function getActiveDatesInMonth(
  countySlug: string,
  year: number,
  month: number
): Promise<string[]> {
  const days = await getCalendarMonth(countySlug, year, month);
  return days.filter((d) => d.active > 0).map((d) => d.date);
}

// Default lookahead when no explicit date range is given - applies the same
// way whether searching one county or several, so the two search UIs behave
// consistently.
export const DEFAULT_RANGE_DAYS = 60;
// Calendar lookups are cheap (just day-counts, no scraping), but still cap
// how many months of them a single search will do, in case someone crafts
// a URL with a multi-year range.
const MAX_MONTHS_TO_SCAN = 14;

/** Every active date for a county within [fromDate, toDate] (both YYYY-MM-DD, inclusive). */
export async function getActiveDatesInRange(countySlug: string, fromDate: string, toDate: string): Promise<string[]> {
  const dates: string[] = [];
  let [year, month] = fromDate.split("-").map(Number);
  const [toYear, toMonth] = toDate.split("-").map(Number);

  for (let i = 0; i < MAX_MONTHS_TO_SCAN && (year < toYear || (year === toYear && month <= toMonth)); i++) {
    const found = await getActiveDatesInMonth(countySlug, year, month).catch((err) => {
      console.error(`Failed to resolve active dates for ${countySlug} ${year}-${month}:`, err);
      return [];
    });
    dates.push(...found.filter((d) => d >= fromDate && d <= toDate));
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return dates;
}

/** today..today+N days, both as YYYY-MM-DD - the shared default range for both search pages. */
export function defaultDateRange(days = DEFAULT_RANGE_DAYS): { from: string; to: string } {
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { from, to };
}

/**
 * Combines listings across multiple dates for one county into a single
 * result set, each still carrying its own `auctionDate`. Dates are fetched
 * one at a time (not in parallel) - same politeness reasoning as everywhere
 * else in this scraper: a burst of simultaneous requests to one host still
 * looks like automated flooding, even though it's "only" one host, and most
 * dates will already be cache-hits after the first time a month is searched
 * anyway. A single date failing (e.g. one bad network blip) doesn't abort
 * the whole search - it's just skipped.
 */
export async function getMultiDateListings(
  countySlug: string,
  dates: string[],
  zipFilter?: string,
  filters?: ListingFilters,
  options?: { liveEstimates?: boolean; skipPermits?: boolean }
): Promise<AuctionListingView[]> {
  const results: AuctionListingView[] = [];
  for (const date of dates) {
    try {
      const listings = await getAuctionListings(countySlug, date, zipFilter, filters, options);
      results.push(...listings);
    } catch (err) {
      console.error(`Multi-date search: failed to load ${countySlug} ${date}:`, err);
    }
  }
  return results.sort((a, b) => a.auctionDate.localeCompare(b.auctionDate));
}

export interface CountyListingView extends AuctionListingView {
  countyName: string;
  countySlug: string;
}

export interface DateTruncation {
  countyName: string;
  foundCount: number;
  shownCount: number;
}

export interface CrossCountySearchResult {
  listings: CountyListingView[];
  truncated: DateTruncation[];
}

// Regardless of how wide the requested range is, cap how many of a county's
// active dates actually get scraped - a real, measured finding, not a
// guess: scanning even one busy county (Broward/Miami-Dade, which regularly
// have 20-40+ listings on a single active day) across a ~2-month window
// meant scraping over a dozen dates, each needing several paginated
// requests, and that alone ran for several minutes before being killed. A
// date-range alone doesn't bound the actual work, since a busy county can
// have far more active dates in the same range than a quiet one - this cap
// is what actually keeps the worst case bounded. Nearest dates are kept when
// truncating, and the search page shows an honest "found more than shown"
// note per county rather than silently dropping data.
const MAX_DATES_PER_COUNTY = 15;

// Sequential across counties too, not just across dates within one county -
// a burst of requests across many different hosts is the exact pattern that
// got 16 subdomains 403'd earlier in this project (see project history),
// even though each individual host only sees one request at a time.
//
// Also skips live RentCast/permit lookups entirely (see getAuctionListings'
// `options`) - Value Estimate/spread filtering here only "sees" properties
// that already have a cached RentCast estimate, same honest limitation the
// homepage's good-deals section already has.
export async function getListingsAcrossCounties(
  countySlugs: string[],
  zipFilter?: string,
  filters?: ListingFilters,
  dateRange?: { from?: string; to?: string }
): Promise<CrossCountySearchResult> {
  const fallback = defaultDateRange();
  const fromDate = dateRange?.from ?? fallback.from;
  const toDate = dateRange?.to ?? fallback.to;

  const results: CountyListingView[] = [];
  const truncated: DateTruncation[] = [];

  for (const slug of countySlugs) {
    const county = getCounty(slug);
    if (!county) continue;
    try {
      const allActiveDates = await getActiveDatesInRange(slug, fromDate, toDate);
      const dates = allActiveDates.slice(0, MAX_DATES_PER_COUNTY);
      if (allActiveDates.length > dates.length) {
        truncated.push({ countyName: county.name, foundCount: allActiveDates.length, shownCount: dates.length });
      }

      const listings = await getMultiDateListings(slug, dates, zipFilter, filters, {
        liveEstimates: false,
        skipPermits: true,
      });
      results.push(...listings.map((listing) => ({ ...listing, countyName: county.name, countySlug: county.slug })));
    } catch (err) {
      console.error(`Cross-county search: failed to load ${slug}:`, err);
    }
  }

  results.sort((a, b) => a.auctionDate.localeCompare(b.auctionDate) || a.countyName.localeCompare(b.countyName));
  return { listings: results, truncated };
}
