import { prisma } from "@/lib/db";
import { ensureTable } from "@/lib/ensureTable";
import { buildZillowUrl } from "@/lib/zillow";
import { sameStreet } from "@/lib/addressMatch";

// Bedrooms, bathrooms and the Zestimate, read from a house's public Zillow
// page - the one thing Florida's free tax roll (floridaParcel.ts) doesn't
// have. Against Zillow's terms of service; see buildZillowUrl in zillow.ts
// for the owner's decision to accept that for this personal-use site.
//
// Kept deliberately gentle: one request per house, only when someone opens
// that house's page (never from a grid, the map or the statewide refresh),
// cached for 30 days. If Zillow blocks the request (a 403/429 or a captcha
// page instead of the listing) this backs off for 30 minutes and the page
// just shows "Unknown" - it never tries to get around the block.
//
// The data lives in the page's __NEXT_DATA__ script:
// props.pageProps.componentProps.gdpClientCache is a JSON *string* whose
// first value's `property` holds the facts (verified 2026-11-02 against
// 499 Rocky Brook Ct, Casselberry: 2 bd / 2 ba / 1,447 sqft, matching the
// county's living area exactly).

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const CACHE_MAX_AGE_DAYS = 30; // Zestimates move; beds/baths don't
const NOT_FOUND_RETRY_AFTER_DAYS = 14;
const PAUSE_AFTER_BLOCK_MS = 30 * 60 * 1000;
let pausedUntil = 0;

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS "ZillowCache" (
  "address" TEXT NOT NULL PRIMARY KEY,
  "data" TEXT,
  "failed" BOOLEAN NOT NULL DEFAULT false,
  "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

export interface ZillowFacts {
  bedrooms: number | null;
  bathrooms: number | null;
  livingArea: number | null;
  yearBuilt: number | null;
  homeType: string | null;
  zestimate: number | null;
  rentZestimate: number | null; // monthly
  hoaFee: number | null; // monthly
  stories: number | null;
  garageSpaces: number | null;
  pool: boolean | null;
  url: string | null;
}

interface ZillowProperty {
  address?: { streetAddress?: string };
  hdpUrl?: string;
  bedrooms?: number;
  bathrooms?: number;
  livingArea?: number;
  yearBuilt?: number;
  homeType?: string;
  zestimate?: number;
  rentZestimate?: number;
  monthlyHoaFee?: number;
  resoFacts?: { stories?: number; garageParkingCapacity?: number; hasPrivatePool?: boolean };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/** "SINGLE_FAMILY" -> "Single family" */
function homeTypeLabel(t: string | undefined): string | null {
  if (!t || t === "UNKNOWN") return null;
  const words = t.toLowerCase().split("_");
  return [words[0][0].toUpperCase() + words[0].slice(1), ...words.slice(1)].join(" ");
}

type FetchResult = { status: "found"; facts: ZillowFacts } | { status: "not-found" } | null;

async function fetchZillowFacts(address: string): Promise<FetchResult> {
  const url = buildZillowUrl(address);
  if (!url) return { status: "not-found" };
  if (Date.now() < pausedUntil) return null;

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  const html = await res.text();
  const nextData = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];

  if (res.status === 403 || res.status === 429 || !nextData) {
    pausedUntil = Date.now() + PAUSE_AFTER_BLOCK_MS;
    console.warn(`Zillow didn't return a listing page (status ${res.status}) - pausing Zillow lookups for 30 minutes.`);
    return null;
  }

  let property: ZillowProperty | undefined;
  try {
    const cache = JSON.parse(nextData)?.props?.pageProps?.componentProps?.gdpClientCache;
    const parsed = typeof cache === "string" ? JSON.parse(cache) : cache;
    property = parsed ? (Object.values(parsed)[0] as { property?: ZillowProperty })?.property : undefined;
  } catch (err) {
    console.error(`Couldn't read Zillow's page data for "${address}":`, err);
    return null; // page format changed - not this house's fault, so not cached
  }
  // No property (Zillow showed search results instead) or it redirected to
  // a different house - either way, not this one.
  const street = address.split(",")[0].trim();
  if (!property?.address?.streetAddress || !sameStreet(street, property.address.streetAddress)) {
    return { status: "not-found" };
  }

  return {
    status: "found",
    facts: {
      bedrooms: num(property.bedrooms),
      bathrooms: num(property.bathrooms),
      livingArea: num(property.livingArea),
      yearBuilt: num(property.yearBuilt),
      homeType: homeTypeLabel(property.homeType),
      zestimate: num(property.zestimate),
      rentZestimate: num(property.rentZestimate),
      hoaFee: num(property.monthlyHoaFee),
      stories: num(property.resoFacts?.stories),
      garageSpaces: num(property.resoFacts?.garageParkingCapacity),
      pool: typeof property.resoFacts?.hasPrivatePool === "boolean" ? property.resoFacts.hasPrivatePool : null,
      url: property.hdpUrl ? `https://www.zillow.com${property.hdpUrl}` : url,
    },
  };
}

/** Zillow's facts for one house, from cache when possible. Null when Zillow has no page for it, blocked us, or couldn't be reached. */
export async function getZillowFacts(address: string): Promise<ZillowFacts | null> {
  await ensureTable(CREATE_TABLE_SQL);
  const cached = await prisma.zillowCache.findUnique({ where: { address } });
  if (cached) {
    const ageDays = (Date.now() - cached.fetchedAt.getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays < (cached.failed ? NOT_FOUND_RETRY_AFTER_DAYS : CACHE_MAX_AGE_DAYS)) {
      return cached.failed || !cached.data ? null : (JSON.parse(cached.data) as ZillowFacts);
    }
  }

  const result = await fetchZillowFacts(address).catch((err) => {
    console.error(`Zillow lookup failed for "${address}":`, err);
    return null;
  });
  // Blocked or unreachable - keep showing whatever was cached before, and record nothing.
  if (!result) return cached && !cached.failed && cached.data ? (JSON.parse(cached.data) as ZillowFacts) : null;

  const data = result.status === "found" ? JSON.stringify(result.facts) : null;
  await prisma.zillowCache.upsert({
    where: { address },
    create: { address, data, failed: result.status !== "found" },
    update: { data, failed: result.status !== "found", fetchedAt: new Date() },
  });
  return result.status === "found" ? result.facts : null;
}
