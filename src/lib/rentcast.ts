// Client for RentCast's /avm/value endpoint (https://developers.rentcast.io).
// Free tier is 50 calls/month, so callers MUST cache aggressively - this
// module only ever makes the actual HTTP call, caching lives in
// getMarketEstimate.ts.

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
