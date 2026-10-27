// Client for RentCast's /avm/value and /properties endpoints
// (https://developers.rentcast.io). Free tier is 50 calls/month across both,
// so callers MUST cache aggressively - this module only ever makes the
// actual HTTP calls, caching lives in getMarketEstimate.ts and
// propertyDetails.ts.

interface RentCastComparable {
  status?: string;
  price?: number;
  squareFootage?: number;
  distance?: number;
}

interface RentCastValueResponse {
  price?: number;
  priceRangeLow?: number;
  priceRangeHigh?: number;
  subjectProperty?: {
    squareFootage?: number;
  };
  comparables?: RentCastComparable[];
}

export interface RentCastValueEstimate {
  price: number | null;
  priceRangeLow: number | null;
  priceRangeHigh: number | null;
  squareFootage: number | null;
  /** Avg $/sqft across comps that had both a price and a square footage. */
  compAvgPricePerSqft: number | null;
  compCount: number;
}

/** The parts of a RentCast /properties record the property page shows - see PropertyDetailsCache in schema.prisma for what's deliberately left out. */
export interface PropertyDetails {
  propertyType: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFootage: number | null;
  lotSize: number | null; // sqft
  yearBuilt: number | null;
  floorCount: number | null;
  garage: boolean | null;
  garageSpaces: number | null;
  pool: boolean | null;
  poolType: string | null;
  cooling: boolean | null;
  coolingType: string | null;
  heating: boolean | null;
  heatingType: string | null;
  fireplace: boolean | null;
  roofType: string | null;
  exteriorType: string | null;
  hoaFee: number | null; // monthly
  subdivision: string | null;
  zoning: string | null;
  ownerOccupied: boolean | null;
  lastSaleDate: string | null; // YYYY-MM-DD
  lastSalePrice: number | null;
  latestTax: { year: number; total: number } | null;
  latestAssessment: { year: number; value: number } | null;
  saleHistory: { date: string; price: number | null }[];
}

interface RentCastPropertyRecord {
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  lotSize?: number;
  yearBuilt?: number;
  subdivision?: string;
  zoning?: string;
  ownerOccupied?: boolean;
  lastSaleDate?: string;
  lastSalePrice?: number;
  hoa?: { fee?: number };
  features?: {
    floorCount?: number;
    garage?: boolean;
    garageSpaces?: number;
    pool?: boolean;
    poolType?: string;
    cooling?: boolean;
    coolingType?: string;
    heating?: boolean;
    heatingType?: string;
    fireplace?: boolean;
    roofType?: string;
    exteriorType?: string;
  };
  propertyTaxes?: Record<string, { year?: number; total?: number }>;
  taxAssessments?: Record<string, { year?: number; value?: number }>;
  history?: Record<string, { event?: string; date?: string; price?: number }>;
}

/** RentCast wants "Street, City, State, Zip"; stored addresses are "STREET, CITY, ZIP" or "STREET, CITY, FL- ZIP" depending on county. */
function toRentCastAddress(address: string): string {
  const parts = address.split(",").map((p) => p.trim());
  const zip = parts.slice(2).join(" ").match(/\d{5}/)?.[0];
  return parts.length >= 3 && zip ? `${parts[0]}, ${parts[1]}, FL, ${zip}` : address;
}

/** The entry for the most recent year in a RentCast by-year object ({"2023": {...}, "2024": {...}}). */
function latestYear<T>(byYear: Record<string, T> | undefined): T | undefined {
  const years = Object.keys(byYear ?? {}).sort();
  return years.length ? byYear![years[years.length - 1]] : undefined;
}

export type PropertyRecordResult = { status: "found"; details: PropertyDetails } | { status: "not-found" };

/**
 * One RentCast /properties lookup. Returns null when it couldn't actually
 * check (no API key, quota used up, RentCast down) - callers shouldn't cache
 * that as "this house has no record", unlike a genuine `not-found`.
 */
export async function fetchPropertyRecord(address: string): Promise<PropertyRecordResult | null> {
  const apiKey = process.env.RENTCAST_API_KEY;
  if (!apiKey) {
    console.warn("RENTCAST_API_KEY not set - skipping property record lookup.");
    return null;
  }

  const url = `https://api.rentcast.io/v1/properties?address=${encodeURIComponent(toRentCastAddress(address))}`;
  const res = await fetch(url, { headers: { "X-Api-Key": apiKey } });
  if (res.status === 404) return { status: "not-found" };
  if (!res.ok) {
    console.error(`RentCast property lookup failed for "${address}": ${res.status} ${await res.text()}`);
    return null;
  }

  const records = (await res.json()) as RentCastPropertyRecord[];
  const r = records[0];
  if (!r) return { status: "not-found" };

  const f = r.features ?? {};
  const tax = latestYear(r.propertyTaxes);
  const assessment = latestYear(r.taxAssessments);
  const saleHistory = Object.values(r.history ?? {})
    .filter((h) => h.event === "Sale" && h.date)
    .map((h) => ({ date: h.date!.slice(0, 10), price: h.price ?? null }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  return {
    status: "found",
    details: {
      propertyType: r.propertyType ?? null,
      bedrooms: r.bedrooms ?? null,
      bathrooms: r.bathrooms ?? null,
      squareFootage: r.squareFootage ?? null,
      lotSize: r.lotSize ?? null,
      yearBuilt: r.yearBuilt ?? null,
      floorCount: f.floorCount ?? null,
      garage: f.garage ?? null,
      garageSpaces: f.garageSpaces ?? null,
      pool: f.pool ?? null,
      poolType: f.poolType ?? null,
      cooling: f.cooling ?? null,
      coolingType: f.coolingType ?? null,
      heating: f.heating ?? null,
      heatingType: f.heatingType ?? null,
      fireplace: f.fireplace ?? null,
      roofType: f.roofType ?? null,
      exteriorType: f.exteriorType ?? null,
      hoaFee: r.hoa?.fee ?? null,
      subdivision: r.subdivision ?? null,
      zoning: r.zoning ?? null,
      ownerOccupied: r.ownerOccupied ?? null,
      lastSaleDate: r.lastSaleDate?.slice(0, 10) ?? null,
      lastSalePrice: r.lastSalePrice ?? null,
      latestTax: tax?.total != null ? { year: tax.year ?? 0, total: tax.total } : null,
      latestAssessment: assessment?.value != null ? { year: assessment.year ?? 0, value: assessment.value } : null,
      saleHistory,
    },
  };
}

export async function fetchValueEstimate(address: string): Promise<RentCastValueEstimate | null> {
  const apiKey = process.env.RENTCAST_API_KEY;
  if (!apiKey) {
    console.warn("RENTCAST_API_KEY not set - skipping value estimate.");
    return null;
  }

  const url = `https://api.rentcast.io/v1/avm/value?address=${encodeURIComponent(address)}`;
  const res = await fetch(url, { headers: { "X-Api-Key": apiKey } });

  if (!res.ok) {
    console.error(`RentCast value estimate failed for "${address}": ${res.status} ${await res.text()}`);
    return null;
  }

  const data = (await res.json()) as RentCastValueResponse;

  const comps = (data.comparables ?? []).filter(
    (c): c is Required<Pick<RentCastComparable, "price" | "squareFootage">> & RentCastComparable =>
      typeof c.price === "number" && typeof c.squareFootage === "number" && c.squareFootage > 0
  );
  const compAvgPricePerSqft =
    comps.length > 0
      ? comps.reduce((sum, c) => sum + c.price / c.squareFootage, 0) / comps.length
      : null;

  return {
    price: data.price ?? null,
    priceRangeLow: data.priceRangeLow ?? null,
    priceRangeHigh: data.priceRangeHigh ?? null,
    squareFootage: data.subjectProperty?.squareFootage ?? null,
    compAvgPricePerSqft,
    compCount: comps.length,
  };
}
