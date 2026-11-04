import { prisma } from "@/lib/db";
import { scrapeCalendarMonth, type DayCount } from "@/lib/scrapeCalendar";
import { getCounty } from "@/lib/counties";
import { getOrRefreshRows } from "@/lib/getAuctionListings";

const CACHE_MAX_AGE_MS = 3 * 60 * 60 * 1000; // 3 hours - today's counts shift during the day

export async function getCalendarMonth(
  countySlug: string,
  year: number,
  month: number
): Promise<DayCount[]> {
  const county = getCounty(countySlug);
  if (!county) throw new Error(`Unsupported county: ${countySlug}`);
  return getCalendarMonthForHost(countySlug, county.host, year, month);
}

/**
 * The cached month calendar for any RealForeclose/RealTaxDeed host - both
 * platforms serve the identical calendar page. `cacheKey` is what the month
 * is cached under: the county slug for foreclosures, taxDeedKey(slug) for
 * tax deeds, so the same county's two calendars don't overwrite each other.
 */
export async function getCalendarMonthForHost(
  cacheKey: string,
  host: string,
  year: number,
  month: number
): Promise<DayCount[]> {
  const cached = await prisma.calendarCache.findUnique({
    where: { countySlug_year_month: { countySlug: cacheKey, year, month } },
  });
  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_MAX_AGE_MS) {
    return JSON.parse(cached.data) as DayCount[];
  }

  const days = await scrapeCalendarMonth(host, year, month);

  await prisma.calendarCache.upsert({
    where: { countySlug_year_month: { countySlug: cacheKey, year, month } },
    create: { countySlug: cacheKey, year, month, data: JSON.stringify(days) },
    update: { data: JSON.stringify(days), fetchedAt: new Date() },
  });

  return days;
}

/**
 * Same shape as getCalendarMonth, but `active`/`scheduled` are how many of
 * that day's listings actually match `zip` - the source site's own calendar
 * has no concept of zip codes, so there's no cheap single request for this.
 * Instead: take the (already-cheap, already-cached) county-wide active days,
 * and for each one, use the already-cached-after-first-view scrape to count
 * zip matches directly - deliberately NOT going through
 * getAuctionListings/RentCast, since we only need a count here, not
 * valuations, and this can touch many days at once.
 */
export async function getCalendarMonthForZip(
  countySlug: string,
  year: number,
  month: number,
  zip: string
): Promise<DayCount[]> {
  const county = getCounty(countySlug);
  if (!county) throw new Error(`Unsupported county: ${countySlug}`);

  const countyWideDays = await getCalendarMonth(countySlug, year, month);
  const activeDates = countyWideDays.filter((d) => d.active > 0).map((d) => d.date);

  const results: DayCount[] = [];
  for (const date of activeDates) {
    const rows = await getOrRefreshRows(county, date).catch((err) => {
      console.error(`Zip-count fetch failed for ${countySlug} ${date}:`, err);
      return [];
    });
    const matchCount = rows.filter((r) => r.zipCode === zip).length;
    if (matchCount > 0) results.push({ date, active: matchCount, scheduled: matchCount });
  }
  return results;
}
