import { prisma } from "@/lib/db";
import { ensureTable } from "@/lib/ensureTable";
import type { Coordinates } from "@/lib/geocode";
import { parseStreet, sameStreet } from "@/lib/addressMatch";

// A house's own record from Florida's property tax roll: every county
// property appraiser sends the Department of Revenue a yearly file for every
// parcel (living area, year built, lot size, use type, the appraiser's
// market value, recent sales), and a statewide copy of it is published as a
// public ArcGIS service. Free, no key, no quota - public records under
// Chapter 119. What it does NOT have is bedrooms/bathrooms (the state roll
// never records them) - see zillowFacts.ts for those.
//
// Caveat: this particular copy is hosted on the Alachua County Property
// Appraiser's ArcGIS account (found 2026-11-02; data current for the 2026
// roll), not an official state endpoint, so it could move. Results are
// cached per address so the site leans on it as little as possible. A
// Florida Health copy (maps.floridahealth.gov EHWATER/Parcels) also works
// but is frozen at 2011 data - don't switch to it.
//
// It's queried by location, not address: PHY_ADDR1 isn't indexed, and an
// address search across ~10.8M parcels took 55s and then errored. A small
// box around the geocoded point (Census puts that on the street in front
// of the house, not inside the lot - a plain point query found nothing)
// returns the handful of nearby parcels, and the right one is picked by
// matching house number + street name. No match means no record - never a
// neighbor's.

const SERVICE_URL =
  "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0/query";
// Deliberately no owner name/mailing address fields - this app has no use for them.
const FIELDS = [
  "PARCEL_ID", "PHY_ADDR1", "PHY_ADDR2", "DOR_UC", "TOT_LVG_AR", "ACT_YR_BLT", "EFF_YR_BLT", "LND_SQFOOT",
  "NO_BULDNG", "NO_RES_UNT", "JV", "LND_VAL", "SPEC_FEAT_", "JV_HMSTD", "ASMNT_YR",
  "SALE_PRC1", "SALE_YR1", "SALE_MO1", "SALE_PRC2", "SALE_YR2", "SALE_MO2",
].join(",");
// ~50m each way - enough to reach from the street-side geocode into the lot.
const BOX_HALF_WIDTH_DEGREES = 0.0005;
const CACHE_MAX_AGE_DAYS = 30; // the roll only changes yearly, but just values get revised
const NOT_FOUND_RETRY_AFTER_DAYS = 7;

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS "ParcelRecordCache" (
  "address" TEXT NOT NULL PRIMARY KEY,
  "data" TEXT,
  "failed" BOOLEAN NOT NULL DEFAULT false,
  "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

export interface FloridaParcelRecord {
  parcelId: string;
  propertyType: string | null;
  livingArea: number | null; // sqft
  yearBuilt: number | null;
  /** The appraiser's estimate of the building's age after renovations - later than yearBuilt means it's been substantially updated. */
  effectiveYearBuilt: number | null;
  lotSize: number | null; // sqft
  buildings: number | null;
  residentialUnits: number | null;
  /** "Just value" - the county appraiser's market value, before exemptions or Save Our Homes caps. */
  marketValue: number | null;
  landValue: number | null;
  /** Value of extras like pools, docks, screen enclosures - the roll records the dollar amount, not what they are. */
  extraFeaturesValue: number | null;
  /** A homestead exemption means the owner claimed it as their primary residence - i.e. someone likely lives there. */
  homestead: boolean;
  rollYear: number | null;
  sales: { year: number; month: number | null; price: number }[];
}

interface ParcelAttributes {
  PARCEL_ID?: string;
  PHY_ADDR1?: string;
  PHY_ADDR2?: string;
  DOR_UC?: string;
  TOT_LVG_AR?: number;
  ACT_YR_BLT?: number;
  EFF_YR_BLT?: number;
  LND_SQFOOT?: number;
  NO_BULDNG?: number;
  NO_RES_UNT?: number;
  JV?: number;
  LND_VAL?: number;
  SPEC_FEAT_?: number;
  JV_HMSTD?: number;
  ASMNT_YR?: number;
  SALE_PRC1?: number;
  SALE_YR1?: number;
  SALE_MO1?: string;
  SALE_PRC2?: number;
  SALE_YR2?: number;
  SALE_MO2?: string;
}

// Florida DOR property use codes - residential ones spelled out, the rest by category.
const RESIDENTIAL_USE: Record<string, string> = {
  "000": "Vacant residential land",
  "001": "Single family",
  "002": "Mobile home",
  "003": "Multi-family (10+ units)",
  "004": "Condominium",
  "005": "Cooperative",
  "006": "Retirement home",
  "007": "Miscellaneous residential",
  "008": "Multi-family (under 10 units)",
  "009": "Residential common area",
};

function propertyUseLabel(code: string | undefined): string | null {
  if (!code) return null;
  const padded = code.trim().padStart(3, "0");
  if (RESIDENTIAL_USE[padded]) return RESIDENTIAL_USE[padded];
  const n = Number(padded);
  if (n >= 10 && n <= 39) return "Commercial";
  if (n >= 40 && n <= 49) return "Industrial";
  if (n >= 50 && n <= 69) return "Agricultural";
  if (n >= 70 && n <= 79) return "Institutional";
  if (n >= 80 && n <= 89) return "Government-owned";
  if (n >= 90 && n <= 99) return "Miscellaneous";
  return null;
}

/** Picks the one parcel whose address is this house - or null if none or several fit (several = condo units we can't tell apart). */
function pickParcel(street: string, candidates: ParcelAttributes[]): ParcelAttributes | null {
  const target = parseStreet(street);
  if (!target) return null;
  const onStreet = candidates.filter((c) => c.PHY_ADDR1 && sameStreet(street, c.PHY_ADDR1));
  if (onStreet.length <= 1) return onStreet[0] ?? null;
  if (!target.unit) return null;
  const sameUnit = onStreet.filter((c) =>
    new RegExp(`\\b${target.unit}\\b`).test(`${c.PHY_ADDR1 ?? ""} ${c.PHY_ADDR2 ?? ""}`.toUpperCase())
  );
  return sameUnit.length === 1 ? sameUnit[0] : null;
}

function positive(n: number | undefined): number | null {
  return typeof n === "number" && n > 0 ? n : null;
}

function toRecord(a: ParcelAttributes): FloridaParcelRecord {
  const sales: FloridaParcelRecord["sales"] = [];
  for (const [price, year, month] of [
    [a.SALE_PRC1, a.SALE_YR1, a.SALE_MO1],
    [a.SALE_PRC2, a.SALE_YR2, a.SALE_MO2],
  ] as const) {
    // $100-ish "sales" are paperwork transfers between family/trusts, not market sales.
    if (typeof price === "number" && price >= 1000 && typeof year === "number" && year > 0) {
      const m = Number(month);
      sales.push({ year, month: Number.isInteger(m) && m >= 1 && m <= 12 ? m : null, price });
    }
  }
  return {
    parcelId: a.PARCEL_ID ?? "",
    propertyType: propertyUseLabel(a.DOR_UC),
    livingArea: positive(a.TOT_LVG_AR),
    yearBuilt: positive(a.ACT_YR_BLT),
    effectiveYearBuilt: positive(a.EFF_YR_BLT),
    lotSize: positive(a.LND_SQFOOT),
    buildings: typeof a.NO_BULDNG === "number" ? a.NO_BULDNG : null,
    residentialUnits: typeof a.NO_RES_UNT === "number" ? a.NO_RES_UNT : null,
    marketValue: positive(a.JV),
    landValue: positive(a.LND_VAL),
    extraFeaturesValue: positive(a.SPEC_FEAT_),
    // The homesteaded share of the market value - above zero only when a homestead exemption is on the parcel.
    homestead: (a.JV_HMSTD ?? 0) > 0,
    rollYear: positive(a.ASMNT_YR),
    sales,
  };
}

async function queryParcels(params: Record<string, string>): Promise<ParcelAttributes[]> {
  const qs = new URLSearchParams({ outFields: FIELDS, returnGeometry: "false", f: "json", ...params });
  const res = await fetch(`${SERVICE_URL}?${qs}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Florida parcel service request failed: ${res.status}`);
  const body = (await res.json()) as { features?: { attributes: ParcelAttributes }[]; error?: { message?: string } };
  if (body.error) throw new Error(`Florida parcel service error: ${body.error.message ?? JSON.stringify(body.error)}`);
  return (body.features ?? []).map((f) => f.attributes);
}

/**
 * The tax-roll record for one house. Tries the scraped parcel ID first (an
 * indexed, exact lookup - works even when the address never geocoded),
 * then the nearby-parcels search around `coords`. Either way the parcel's
 * own street address has to match before it's used. Throws only if the
 * service itself is unreachable (not cached, so it's retried next visit).
 */
export async function getFloridaParcel(
  address: string,
  coords: Coordinates | null,
  parcelId: string | null
): Promise<FloridaParcelRecord | null> {
  await ensureTable(CREATE_TABLE_SQL);
  const cached = await prisma.parcelRecordCache.findUnique({ where: { address } });
  if (cached) {
    const ageDays = (Date.now() - cached.fetchedAt.getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays < (cached.failed ? NOT_FOUND_RETRY_AFTER_DAYS : CACHE_MAX_AGE_DAYS)) {
      return cached.failed || !cached.data ? null : (JSON.parse(cached.data) as FloridaParcelRecord);
    }
  }

  const street = address.split(",")[0].trim();
  let match: ParcelAttributes | null = null;

  // Only letters/digits/dashes ever go into the query - parcel IDs never contain anything else.
  const safeId = parcelId?.replace(/[^A-Za-z0-9-]/g, "");
  if (safeId) {
    const ids = [...new Set([safeId, safeId.replace(/-/g, "")])].map((id) => `'${id}'`).join(",");
    match = pickParcel(street, await queryParcels({ where: `PARCEL_ID IN (${ids})` }));
  }
  if (!match && coords) {
    const d = BOX_HALF_WIDTH_DEGREES;
    match = pickParcel(
      street,
      await queryParcels({
        geometry: [coords.lng - d, coords.lat - d, coords.lng + d, coords.lat + d].join(","),
        geometryType: "esriGeometryEnvelope",
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
      })
    );
  }
  // Nothing to search with at all (no parcel ID, address never geocoded) -
  // not a real "no record", so don't cache it.
  if (!match && !safeId && !coords) return null;

  const record = match ? toRecord(match) : null;
  const data = record ? JSON.stringify(record) : null;
  await prisma.parcelRecordCache.upsert({
    where: { address },
    create: { address, data, failed: !record },
    update: { data, failed: !record, fetchedAt: new Date() },
  });
  return record;
}
