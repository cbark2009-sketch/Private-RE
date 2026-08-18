import { prisma } from "@/lib/db";
import { fetchValueEstimate } from "@/lib/rentcast";

const CACHE_MAX_AGE_DAYS = 30;
// If a lookup failed (bad address, RentCast down, quota exhausted), don't
// retry on every page view - that just burns more of the monthly quota on
// something that's probably going to fail again anyway.
const FAILURE_RETRY_AFTER_DAYS = 7;

export interface MarketEstimate {
  price: number | null;
  priceRangeLow: number | null;
  priceRangeHigh: number | null;
  squareFootage: number | null;
  compAvgPricePerSqft: number | null;
  compCount: number;
}

/** Cached-by-address wrapper around RentCast - see rentcast.ts for the raw API call. */
export async function getMarketEstimate(address: string): Promise<MarketEstimate | null> {
  const cached = await prisma.valueEstimateCache.findUnique({ where: { address } });

  const ageDays = cached ? (Date.now() - cached.fetchedAt.getTime()) / (24 * 60 * 60 * 1000) : Infinity;
  const isFresh = cached && ageDays < (cached.failed ? FAILURE_RETRY_AFTER_DAYS : CACHE_MAX_AGE_DAYS);

  if (isFresh) {
    return cached.failed ? null : toMarketEstimate(cached);
  }

  const result = await fetchValueEstimate(address).catch((err) => {
    console.error(`RentCast lookup threw for "${address}":`, err);
    return null;
  });

  await prisma.valueEstimateCache.upsert({
    where: { address },
    create: { address, failed: !result, ...(result ?? {}) },
    update: { failed: !result, fetchedAt: new Date(), ...(result ?? {}) },
  });

  return result;
}

/**
 * Same as getMarketEstimate, but never makes a live RentCast call - only
 * ever reads whatever's already cached (regardless of the normal 30-day
 * freshness window, since "possibly a bit stale" still beats "no data" for
 * this use case). Exists for searches that touch many addresses at once
 * (cross-county search, the homepage's good-deals list) where waiting on a
 * live RentCast round-trip per never-before-seen address is what actually
 * makes those searches slow - a 2-county live search took long enough to
 * need killing before this existed. Judgment/Assessed/Max-Bid data is
 * unaffected either way since those never depended on RentCast.
 */
export async function getCachedMarketEstimate(address: string): Promise<MarketEstimate | null> {
  const cached = await prisma.valueEstimateCache.findUnique({ where: { address } });
  if (!cached || cached.failed) return null;
  return toMarketEstimate(cached);
}

function toMarketEstimate(cached: {
  price: number | null;
  priceRangeLow: number | null;
  priceRangeHigh: number | null;
  squareFootage: number | null;
  compAvgPricePerSqft: number | null;
  compCount: number | null;
}): MarketEstimate {
  return {
    price: cached.price,
    priceRangeLow: cached.priceRangeLow,
    priceRangeHigh: cached.priceRangeHigh,
    squareFootage: cached.squareFootage,
    compAvgPricePerSqft: cached.compAvgPricePerSqft,
    compCount: cached.compCount ?? 0,
  };
}
