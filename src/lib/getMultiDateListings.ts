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
