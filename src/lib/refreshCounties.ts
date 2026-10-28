import { prisma } from "@/lib/db";
import { ensureTable } from "@/lib/ensureTable";
import { COUNTIES } from "@/lib/counties";
import { addDays, toISODate } from "@/lib/dates";
import { getActiveDatesInRange } from "@/lib/getMultiDateListings";
import { getOrRefreshRows } from "@/lib/getAuctionListings";
import { geocodeAddresses, MAX_ADDRESSES_PER_REQUEST } from "@/lib/geocode";

// Keeps every supported county's upcoming auctions in the database so the
// homepage map covers the whole state, not just counties someone happened
// to search. Run on a schedule by /api/refresh-counties (see vercel.json).
//
// Vercel's Hobby plan caps each scheduled run at 5 minutes and each
// schedule at once a day. Measured on the first full run (local database,
// 2026-10-27): all 38 counties, ~2,000 listings and ~1,500 new geocodes in
// 107 seconds. On Vercel every database write is a network round trip to
// Turso instead of a local file, so a first run there can take longer than
// one 5-minute window - so each run works through the most out-of-date
// counties until its time budget is used, and vercel.json schedules a few
// runs a day: a run that gets cut off just leaves the rest for the next one,
// and once everything's current most runs only refresh the few counties
// that are due.
//
// Scraping stays strictly one request at a time, one host at a time - the
// same politeness rule as everywhere else in this app (a burst across many
// RealForeclose subdomains got 16 of them 403'd earlier in this project).
// Deliberately no RentCast or permit lookups here: this only fills in what
// the map needs (case data + coordinates), never spends paid quota.

/** How far ahead the map looks - most counties schedule sales roughly a month out. */
export const DAYS_AHEAD = 30;
// A county refreshed more recently than this is skipped. Under 24h so a
// county refreshed around the same time yesterday still counts as due.
const REFRESH_EVERY_HOURS = 20;

// Same SQL as the add_county_refresh migration - see ensureTable.ts.
const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS "CountyRefresh" (
  "countySlug" TEXT NOT NULL PRIMARY KEY,
  "refreshedAt" DATETIME NOT NULL,
  "listingCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT
)`;

export interface RefreshSummary {
  refreshed: { county: string; dates: number; listings: number; error?: string }[];
  /** Counties still due that this run didn't get to - the next run starts with them. */
  stillDue: string[];
  elapsedSeconds: number;
}

export async function refreshCounties({ budgetMs }: { budgetMs: number }): Promise<RefreshSummary> {
  const started = Date.now();
  const outOfTime = () => Date.now() - started > budgetMs;
  await ensureTable(CREATE_TABLE_SQL);

  const records = await prisma.countyRefresh.findMany();
  const lastRefreshed = new Map(records.map((r) => [r.countySlug, r.refreshedAt.getTime()]));
  // Never-refreshed counties first, then oldest first.
  const due = COUNTIES.filter((c) => {
    const last = lastRefreshed.get(c.slug);
    return last == null || Date.now() - last > REFRESH_EVERY_HOURS * 60 * 60 * 1000;
  }).sort((a, b) => (lastRefreshed.get(a.slug) ?? 0) - (lastRefreshed.get(b.slug) ?? 0));

  const from = toISODate(new Date());
  const to = addDays(from, DAYS_AHEAD);
  const refreshed: RefreshSummary["refreshed"] = [];
  const completed = new Set<string>();

  for (const county of due) {
    if (outOfTime()) break;

    const dates = await getActiveDatesInRange(county.slug, from, to);
    const addresses = new Set<string>();
    let listings = 0;
    let error: string | undefined;
    let finished = true;

    for (const date of dates) {
      if (outOfTime()) {
        finished = false;
        break;
      }
      try {
        // Reuses the normal scrape-and-cache path: a date already scraped in
        // the last 24h (e.g. someone just browsed it) costs no requests.
        const rows = await getOrRefreshRows(county, date);
        listings += rows.length;
        for (const row of rows) if (row.propertyAddress) addresses.add(row.propertyAddress);
      } catch (err) {
        console.error(`Statewide refresh: ${county.slug} ${date} failed:`, err);
        error = err instanceof Error ? err.message : String(err);
      }
    }

    // Place this county's dots on the map now, so the homepage doesn't have
    // to geocode hundreds of new addresses while someone waits.
    const toGeocode = [...addresses];
    for (let i = 0; i < toGeocode.length && !outOfTime(); i += MAX_ADDRESSES_PER_REQUEST) {
      await geocodeAddresses(toGeocode.slice(i, i + MAX_ADDRESSES_PER_REQUEST)).catch((err) => {
        console.error(`Statewide refresh: geocoding ${county.slug} failed:`, err);
      });
    }

    refreshed.push({ county: county.name, dates: dates.length, listings, ...(error ? { error } : {}) });
    // A county cut off by the time budget isn't marked done, so the next run
    // picks it straight back up - its already-scraped dates are cached, so
    // that costs almost nothing.
    if (!finished) break;
    await prisma.countyRefresh.upsert({
      where: { countySlug: county.slug },
      create: { countySlug: county.slug, refreshedAt: new Date(), listingCount: listings, lastError: error ?? null },
      update: { refreshedAt: new Date(), listingCount: listings, lastError: error ?? null },
    });
    completed.add(county.slug);
  }

  return {
    refreshed,
    stillDue: due.filter((c) => !completed.has(c.slug)).map((c) => c.name),
    elapsedSeconds: Math.round((Date.now() - started) / 1000),
  };
}

/** How many counties the scheduled refresh has covered recently - for the map's caption. */
export async function getRefreshCoverage(): Promise<{ fresh: number; total: number }> {
  await ensureTable(CREATE_TABLE_SQL);
  const fresh = await prisma.countyRefresh.count({
    where: { refreshedAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) } },
  });
  return { fresh, total: COUNTIES.length };
}
