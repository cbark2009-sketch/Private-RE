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

// How far forward to check for listings when a price filter is applied
// without a specific date selection - "search everything," not just
// whichever month happens to be in view. Bounded rather than unlimited: in
// practice a county's site only ever has a few weeks to ~2 months of
// auctions actually posted, so this comfortably covers that with room to
// spare, without scanning indefinitely. Cheap to check even months with
// nothing in them - this only calls the lightweight per-month calendar
// (day-counts), never scrapes/estimates a date until it's confirmed active.
const MONTHS_TO_SCAN_AHEAD = 6;

/** Every active date across the current month and the next several months - used whenever a price filter should search everything, not just one month. */
export async function getActiveDatesAcrossMonths(countySlug: string, startYear: number, startMonth: number): Promise<string[]> {
  const allDates: string[] = [];
  let year = startYear;
  let month = startMonth;
  for (let i = 0; i < MONTHS_TO_SCAN_AHEAD; i++) {
    const dates = await getActiveDatesInMonth(countySlug, year, month).catch((err) => {
      console.error(`Failed to resolve active dates for ${countySlug} ${year}-${month}:`, err);
      return [];
    });
    allDates.push(...dates);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return allDates;
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

// Cross-county search caps by NUMBER OF DATES, not months - a real finding,
// not a guess: scanning even one busy county (Broward/Miami-Dade, which
// regularly have 20-40+ listings on a single active day) across a 2-month
// window meant scraping over a dozen dates, each needing several paginated
// requests, and that alone ran for several minutes before being killed. A
// month-based window doesn't bound the actual work, since a busy county
// can have far more active dates per month than a quiet one. Taking just the
// next few active dates per county bounds the worst case regardless of how
// busy that county's calendar is.
const DATES_PER_COUNTY = 3;

/** Scans forward from today (cheap - just per-month calendar day-counts) until it's found `count` active dates, or gives up after a bounded number of months. */
async function getNextActiveDates(countySlug: string, count: number): Promise<string[]> {
  const dates: string[] = [];
  const today = new Date();
  let year = today.getUTCFullYear();
  let month = today.getUTCMonth() + 1;
  const MAX_MONTHS_TO_CHECK = 6; // safety valve - stop looking even if a county genuinely has nothing posted

  for (let i = 0; i < MAX_MONTHS_TO_CHECK && dates.length < count; i++) {
    const found = await getActiveDatesInMonth(countySlug, year, month).catch(() => []);
    dates.push(...found);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return dates.slice(0, count);
}

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
  filters?: ListingFilters
): Promise<CountyListingView[]> {
  const results: CountyListingView[] = [];

  for (const slug of countySlugs) {
    const county = getCounty(slug);
    if (!county) continue;
    try {
      const dates = await getNextActiveDates(slug, DATES_PER_COUNTY);
      const listings = await getMultiDateListings(slug, dates, zipFilter, filters, {
        liveEstimates: false,
        skipPermits: true,
      });
      results.push(...listings.map((listing) => ({ ...listing, countyName: county.name, countySlug: county.slug })));
    } catch (err) {
      console.error(`Cross-county search: failed to load ${slug}:`, err);
    }
  }

  return results.sort((a, b) => a.auctionDate.localeCompare(b.auctionDate) || a.countyName.localeCompare(b.countyName));
}
