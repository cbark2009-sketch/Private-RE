import { getAuctionListings, type AuctionListingView, type PriceFilter } from "@/lib/getAuctionListings";
import { getCalendarMonth } from "@/lib/getCalendarMonth";

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
  priceFilter?: PriceFilter
): Promise<AuctionListingView[]> {
  const results: AuctionListingView[] = [];
  for (const date of dates) {
    try {
      const listings = await getAuctionListings(countySlug, date, zipFilter, priceFilter);
      results.push(...listings);
    } catch (err) {
      console.error(`Multi-date search: failed to load ${countySlug} ${date}:`, err);
    }
  }
  return results.sort((a, b) => a.auctionDate.localeCompare(b.auctionDate));
}
