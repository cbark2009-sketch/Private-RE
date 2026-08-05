// Scrapes a county's own month-view auction calendar
// (index.cfm?zaction=user&zmethod=calendar&selCalDate=MM/01/YYYY), which
// turns out to be plain server-rendered HTML (no AJAX, unlike the daily
// listings) with per-day counts already computed by the site itself. This
// is far cheaper than scraping every individual day: one request gets a
// whole month, versus ~30 separate day-by-day scrapes.
//
// Each day cell that has auctions looks like:
//   <div ... dayid='08/03/2026' >...<span class="CALACT">0</span> /
//   <span class="CALSCH">3</span> FC...</div>
// CALACT = still-active/waiting count (what our own scraper would find right
// now), CALSCH = total originally scheduled for that day (includes ones
// already resolved). Days with no auctions just have no CALACT/CALSCH at
// all. We surface CALACT, since that's what actually matches what clicking
// into that day in this app will show before our own address/value filter.

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 AuctionClarityBot/0.1 (personal research tool)";

export interface DayCount {
  date: string; // YYYY-MM-DD
  active: number;
  scheduled: number;
}

/** month is 1-12. Returns one entry per day in that month that has any scheduled auctions. */
export async function scrapeCalendarMonth(
  host: string,
  year: number,
  month: number
): Promise<DayCount[]> {
  const url =
    `https://${host}/index.cfm?zaction=user&zmethod=calendar` +
    `&selCalDate=${String(month).padStart(2, "0")}/01/${year}`;

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Calendar page request failed: ${res.status}`);
  }
  const html = await res.text();

  const dayBlocks = html.split(/(?=dayid=)/).filter((c) => c.startsWith("dayid="));

  const results: DayCount[] = [];
  for (const block of dayBlocks) {
    const dayIdMatch = block.match(/^dayid='(\d{2})\/(\d{2})\/(\d{4})'/);
    if (!dayIdMatch) continue;
    const [, mm, dd, yyyy] = dayIdMatch;

    const activeMatch = block.match(/CALACT">(\d+)</);
    const schedMatch = block.match(/CALSCH">(\d+)</);
    if (!activeMatch || !schedMatch) continue; // no auctions that day

    results.push({
      date: `${yyyy}-${mm}-${dd}`,
      active: Number(activeMatch[1]),
      scheduled: Number(schedMatch[1]),
    });
  }
  return results;
}
