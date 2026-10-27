import { prisma } from "@/lib/db";

// Address -> map coordinates via the US Census Bureau's free geocoder
// (geocoding.geo.census.gov) - no API key, no quota, and public-domain
// results we're allowed to store (unlike Google's, whose terms forbid
// caching them). Its batch endpoint matches a whole CSV of addresses in one
// request (~2s for a handful, verified against real listing addresses), so
// callers hand over everything they need at once instead of one at a time.
//
// Not every address matches - Census's address database misses some newer
// streets and subdivisions (about 7 of 99 in the first real Orange/Seminole
// test) - so callers have to expect some listings to stay off the map.
// Unit numbers ("# 34", "UNIT 12") are fine; Census ignores them itself.

const BATCH_URL = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch";
const FAILURE_RETRY_AFTER_DAYS = 30;
// Keeps one request comfortably inside a serverless time limit - the map
// sends bigger sets as several requests and fills in as each one returns.
export const MAX_ADDRESSES_PER_REQUEST = 100;
// SQLite caps how many values one `IN (...)` query can bind.
const LOOKUP_CHUNK = 500;

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Production's Turso database only gets schema changes when someone runs
 * scripts/apply-migration.mjs by hand. This table is self-contained (nothing
 * else references it), so it's created on first use instead - the map then
 * works on the very next deploy with no manual step. Same SQL as the
 * add_geocode_cache migration, which also uses IF NOT EXISTS so neither path
 * can conflict with the other.
 */
let tableReady: Promise<unknown> | null = null;
function ensureTable(): Promise<unknown> {
  tableReady ??= prisma
    .$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "GeocodeCache" (
        "address" TEXT NOT NULL PRIMARY KEY,
        "lat" REAL,
        "lng" REAL,
        "failed" BOOLEAN NOT NULL DEFAULT false,
        "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    )
    .catch((err) => {
      tableReady = null; // let the next call try again
      throw err;
    });
  return tableReady;
}

export interface CachedCoordinates {
  found: Map<string, Coordinates>;
  /** Census already tried these recently and couldn't match them - not worth asking again yet. */
  unlocatable: Set<string>;
}

/** Cache-only lookup - never calls Census. Anything in neither set just hasn't been geocoded yet. */
export async function getCachedCoordinates(addresses: string[]): Promise<CachedCoordinates> {
  await ensureTable();
  const found = new Map<string, Coordinates>();
  const unlocatable = new Set<string>();
  const unique = [...new Set(addresses)];

  for (let i = 0; i < unique.length; i += LOOKUP_CHUNK) {
    const rows = await prisma.geocodeCache.findMany({ where: { address: { in: unique.slice(i, i + LOOKUP_CHUNK) } } });
    for (const row of rows) {
      if (!row.failed && row.lat != null && row.lng != null) {
        found.set(row.address, { lat: row.lat, lng: row.lng });
      } else if (Date.now() - row.fetchedAt.getTime() < FAILURE_RETRY_AFTER_DAYS * 24 * 60 * 60 * 1000) {
        unlocatable.add(row.address);
      }
    }
  }
  return { found, unlocatable };
}

/**
 * Returns coordinates for every address (null = Census couldn't match it),
 * using the cache first and one Census batch request for the rest. Throws
 * if Census itself is unreachable - that's transient, so it isn't cached as
 * a failure.
 */
export async function geocodeAddresses(addresses: string[]): Promise<Map<string, Coordinates | null>> {
  const { found, unlocatable } = await getCachedCoordinates(addresses);
  const results = new Map<string, Coordinates | null>(found);
  for (const address of unlocatable) results.set(address, null);

  const toFetch = [...new Set(addresses)].filter((a) => !results.has(a)).slice(0, MAX_ADDRESSES_PER_REQUEST);
  if (toFetch.length === 0) return results;

  const matched = await censusBatch(toFetch);
  for (const address of toFetch) {
    const coords = matched.get(address) ?? null;
    results.set(address, coords);
    await prisma.geocodeCache.upsert({
      where: { address },
      create: { address, lat: coords?.lat ?? null, lng: coords?.lng ?? null, failed: !coords },
      update: { lat: coords?.lat ?? null, lng: coords?.lng ?? null, failed: !coords, fetchedAt: new Date() },
    });
  }
  return results;
}

/**
 * Stored addresses look like "STREET, CITY, ZIP" or "STREET, CITY, FL- ZIP"
 * depending on county (same split buildZillowUrl in zillow.ts relies on).
 * Census wants street/city/state/zip as separate columns; anything that
 * doesn't split cleanly goes in whole as the street, which Census still
 * often matches.
 */
function toCensusColumns(address: string): [street: string, city: string, state: string, zip: string] {
  const parts = address.split(",").map((p) => p.trim());
  if (parts.length >= 3) {
    const zip = parts.slice(2).join(" ").match(/\d{5}/)?.[0] ?? "";
    return [parts[0], parts[1], "FL", zip];
  }
  return [address, "", "FL", address.match(/\b\d{5}\b/)?.[0] ?? ""];
}

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Minimal CSV line parser - Census quotes every field, and the coordinates field itself contains a comma. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

async function censusBatch(addresses: string[]): Promise<Map<string, Coordinates>> {
  // Row ids are just array indexes - responses come back in no particular order.
  const csv = addresses.map((a, i) => [String(i), ...toCensusColumns(a)].map(csvField).join(",")).join("\n");

  const form = new FormData();
  form.append("addressFile", new Blob([csv], { type: "text/csv" }), "addresses.csv");
  form.append("benchmark", "Public_AR_Current");

  const res = await fetch(BATCH_URL, { method: "POST", body: form, signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`Census geocoder request failed: ${res.status}`);
  const text = await res.text();

  // Each line: id, input address, Match/No_Match/Tie, Exact/Non_Exact, matched address, "lng,lat", ...
  const matched = new Map<string, Coordinates>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields = parseCsvLine(line);
    if (fields[2] !== "Match") continue;
    const address = addresses[Number(fields[0])];
    const [lng, lat] = (fields[5] ?? "").split(",").map(Number);
    if (address && Number.isFinite(lat) && Number.isFinite(lng)) matched.set(address, { lat, lng });
  }
  return matched;
}
