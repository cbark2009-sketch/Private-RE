// Scrapes a county's RealForeclose auction preview site. RealForeclose is a
// shared platform - every county in src/lib/counties.ts runs the identical
// application on its own subdomain, just with different data - so this same
// scraping approach (verified against Orange first, then spot-checked
// against Duval) works unmodified across all of them by just swapping the
// host.
//
// The listings are NOT in the initial HTML - the page loads a shell, then
// JavaScript fires an AJAX call to a same-origin endpoint that returns the
// real listing data as JSON. That endpoint doesn't take the auction date as
// a parameter directly; instead the date is tracked server-side against a
// session cookie set when you load the PREVIEW page. So scraping this
// requires two requests sharing one cookie jar: load PREVIEW for the date
// (sets the session), then call the UPDATE endpoint (reads it back out).
//
// We only request AREA=W ("Auctions Waiting" - the upcoming, not-yet-run
// list), since that's what a "what's coming up" tool needs.
//
// The UPDATE endpoint is paginated (~10 items/page) via `bypassPage`, which
// - despite the name suggesting a boolean flag - is actually the 1-indexed
// page number (found by reading the site's own auction.js: `keyPage()` calls
// `loadArea(area, 0, 1, newPage)` where that 4th arg lands in the URL as
// bypassPage). Missing this meant busy counties/days silently got truncated
// to the first ~10 cases - fetch pages until one comes back with no items.

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 AuctionClarityBot/0.1 (personal research tool)";

export interface RawListing {
  caseNumber: string;
  caseDetailUrl: string | null;
  finalJudgmentAmount: number | null;
  parcelId: string | null;
  parcelUrl: string | null;
  propertyAddress: string | null;
  zipCode: string | null;
  assessedValue: number | null;
  plaintiffMaxBid: number | null; // non-null only once an auction has actually happened
}

function parseMoney(text: string | undefined | null): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

const MAX_PAGES = 10; // safety valve (~100 listings) in case the duplicate-page termination ever misbehaves

/** Fetches and concatenates every page's `retHTML` for a given county host and auction date (MM/DD/YYYY). */
async function fetchWaitingAreaHtml(host: string, auctionDateMMDDYYYY: string): Promise<string> {
  const base = `https://${host}/index.cfm`;
  const previewUrl = `${base}?zaction=AUCTION&Zmethod=PREVIEW&AUCTIONDATE=${auctionDateMMDDYYYY}`;

  const previewRes = await fetch(previewUrl, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!previewRes.ok) {
    throw new Error(`Preview page request failed: ${previewRes.status}`);
  }
  // Grab every Set-Cookie the session needs (CFID/CFTOKEN + the AWS load
  // balancer affinity cookie) and replay them on every page request below -
  // this session (tied to the date) only needs setting up once.
  const cookies = previewRes.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

  let combined = "";
  let previousIds = "";
  for (let page = 1; page <= MAX_PAGES; page++) {
    const updateUrl =
      `${base}?zaction=AUCTION&Zmethod=UPDATE&FNC=LOAD&AREA=W` +
      `&PageDir=0&doR=1&tx=${Date.now()}&bypassPage=${page}&test=1&_=${Date.now()}`;

    const updateRes = await fetch(updateUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Cookie: cookies,
        "X-Requested-With": "XMLHttpRequest",
        Referer: previewUrl,
      },
    });
    if (!updateRes.ok) {
      throw new Error(`Listing data request failed: ${updateRes.status}`);
    }

    const body = (await updateRes.json()) as { retHTML?: string; rlist?: string };
    if (!body.retHTML || !body.retHTML.includes("AITEM_")) break;
    // Requesting a page past the real last one doesn't return empty - the
    // site just re-serves the last valid page's content again. `rlist` (the
    // item IDs on this page) repeating unchanged from the previous page is
    // the actual "no more pages" signal.
    if (body.rlist && body.rlist === previousIds) break;
    previousIds = body.rlist ?? "";
    combined += body.retHTML;
  }
  return combined;
}

/**
 * The retHTML blob isn't valid HTML (it's templated with `@A`/`@B`/`@C`
 * placeholder tokens that client-side JS expands), so we pull fields out
 * with targeted regexes anchored on the human-readable labels rather than
 * trying to parse it as a DOM tree.
 */
function parseListings(retHTML: string): RawListing[] {
  const chunks = retHTML.split(/(?=<div id="AITEM_)/).filter((c) => c.includes("AITEM_"));

  return chunks
    .filter((chunk) => {
      // Some counties' "Waiting" list mixes mortgage FORECLOSURE cases with
      // TAXDEED sales (unpaid property tax certificates), which use entirely
      // different fields (Certificate #, Opening Bid instead of Case #,
      // Final Judgment Amount) - a different legal process this app isn't
      // built to represent. Rather than silently show a tax deed case with
      // broken/null foreclosure fields, skip it. Fail open if the "Auction
      // Type" label is missing/unrecognized (some counties never show it and
      // are foreclosure-only) rather than risk hiding real foreclosure data.
      const typeMatch = chunk.match(/Auction Type:[\s\S]{0,60}?AD_DTA">([^<@]+)/);
      const type = typeMatch?.[1]?.trim().toUpperCase();
      return !type || type.includes("FORECLOSURE");
    })
    .map((chunk): RawListing => {
      // Most counties (e.g. Orange) hyperlink the case number itself to a
      // case detail page. Some (e.g. Miami-Dade, which instead links the
      // Parcel ID to its own property search) render the case number as
      // plain text with no link at all. Try the linked form first since it
      // also gives us caseDetailUrl; fall back to the same delimiter-agnostic
      // plain-text extraction already used for address parsing below rather
      // than falling through to "UNKNOWN" - a missing match here isn't just
      // a blank field, it silently collides every listing on the same
      // Prisma unique key (countySlug+caseNumber+auctionDate) and drops all
      // but one via upsert.
      const linkedCaseMatch = chunk.match(/Case #:[\s\S]{0,80}?<a href="([^"]+)"[^>]*>([^<]+)<\/a>/);
      const plainCaseMatch = chunk.match(/Case #:[\s\S]{0,80}?AD_DTA">([^<@]+)/);
      const judgmentMatch = chunk.match(/Final Judgment Amount:[\s\S]{0,120}?(\$[\d,]+\.\d{2})/);
      const parcelMatch = chunk.match(/Parcel ID:[\s\S]{0,200}?<a href="([^"]*)"[^>]*>([^<]+)<\/a>/);
      const assessedMatch = chunk.match(/Assessed Value:[\s\S]{0,120}?(\$[\d,]+\.\d{2})/);
      // Different counties use different delimiter tokens after each value
      // (Orange uses "@B", Duval uses "@G", etc. - same underlying platform,
      // different per-tenant template), so we rely on the `[^<@]+` capture
      // itself to stop at the next tag or token rather than requiring a
      // specific one.
      const addressMatch = chunk.match(
        /Property Address:[\s\S]{0,80}?AD_DTA">([^<@]+)[\s\S]{0,80}?AD_DTA">([^<@]+)/
      );
      const maxBidMatch = chunk.match(/Plaintiff Max Bid:[\s\S]{0,120}?(\$[\d,]+\.\d{2})/);

      const parcelText = parcelMatch?.[2]?.trim() ?? null;
      // The site uses the parcel link text as a fallback label ("Property
      // Appraiser", "TIMESHARE") when there's no real parcel number - only
      // keep it if it actually looks like a parcel ID (digits, dashes).
      const parcelId = parcelText && /^[\d-]+$/.test(parcelText) ? parcelText : null;

      // Second address line is "CITY, ZIP" (Orange) or "CITY, FL- ZIP" (Duval)
      // or similar - pull out the 5-digit zip regardless of what's around it.
      const zipCode = addressMatch?.[2]?.match(/\d{5}/)?.[0] ?? null;

      return {
        caseNumber: (linkedCaseMatch?.[2] ?? plainCaseMatch?.[1])?.trim() ?? "UNKNOWN",
        caseDetailUrl: linkedCaseMatch?.[1] ?? null,
        finalJudgmentAmount: parseMoney(judgmentMatch?.[1]),
        parcelId,
        parcelUrl: parcelId ? parcelMatch?.[1] ?? null : null,
        propertyAddress: addressMatch ? `${addressMatch[1].trim()}, ${addressMatch[2].trim()}` : null,
        zipCode,
        assessedValue: parseMoney(assessedMatch?.[1]),
        plaintiffMaxBid: parseMoney(maxBidMatch?.[1]),
      };
    });
}

/** auctionDate as "YYYY-MM-DD"; returns the parsed upcoming listings for that date on the given county's site. */
export async function scrapeAuctionDate(host: string, auctionDate: string): Promise<RawListing[]> {
  const [y, m, d] = auctionDate.split("-");
  const mmddyyyy = `${m}/${d}/${y}`;
  const retHTML = await fetchWaitingAreaHtml(host, mmddyyyy);
  if (!retHTML.includes("AITEM_")) return [];
  return parseListings(retHTML);
}
