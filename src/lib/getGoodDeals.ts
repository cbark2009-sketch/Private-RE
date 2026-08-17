import { prisma } from "@/lib/db";
import { estimatePropertyValue } from "@/lib/valuation";
import { toISODate } from "@/lib/dates";
import { getCounty } from "@/lib/counties";
import type { AuctionListingView } from "@/lib/getAuctionListings";

export interface GoodDeal extends AuctionListingView {
  countyName: string;
  countySlug: string;
  ratio: number;
}

// "Good deal" = estimated value is meaningfully above what you'd likely have
// to bid (the judgment amount) - not a hard promise, just a starting filter.
const MIN_RATIO = 1.3;
// A judgment that's tiny relative to value (10x+) is a red flag, not a
// steal - almost always means a junior lien (an HOA foreclosure, most
// commonly), where winning the auction does NOT clear the property of a
// much larger first mortgage that survives the sale. Excluding these
// outright rather than just relying on the caveat text below, since the
// ratio itself is the signal that something's off, not evidence of a deal.
const MAX_RATIO = 5;
// Don't show a half-empty, unconvincing section - if fewer than this many
// upcoming listings clear the bar, skip the section entirely rather than
// pad it out with marginal ones.
const MIN_RESULTS_TO_SHOW = 3;

/**
 * Surfaces upcoming listings whose value estimate is well above their
 * judgment amount, across every county that's been browsed so far.
 * Deliberately reads ONLY already-cached market estimates (a raw
 * ValueEstimateCache lookup, not getMarketEstimate's live-fallback path) -
 * this must never spend RentCast's 50/month quota just to render the
 * homepage. Practical effect: a listing only shows up here once someone has
 * actually viewed it (or its county/date) at least once before - the
 * section fills in gradually as the app gets used, which is an acceptable
 * tradeoff for not burning quota speculatively.
 */
export async function getGoodDeals(limit = 6): Promise<GoodDeal[]> {
  const today = new Date(toISODate(new Date()));

  const rows = await prisma.listing.findMany({
    where: {
      auctionDate: { gte: today },
      propertyAddress: { not: null },
      finalJudgmentAmount: { gt: 0 },
    },
    orderBy: { auctionDate: "asc" },
  });
  if (rows.length === 0) return [];

  const addresses = [...new Set(rows.map((r) => r.propertyAddress!))];
  const cachedEstimates = await prisma.valueEstimateCache.findMany({
    where: { address: { in: addresses }, failed: false },
  });
  const estimateByAddress = new Map(cachedEstimates.map((e) => [e.address, e]));

  const seenAddresses = new Set<string>();
  const deals: GoodDeal[] = [];

  for (const row of rows) {
    const address = row.propertyAddress!;
    // A rescheduled case can leave more than one upcoming row for the same
    // property - only surface it once.
    if (seenAddresses.has(address)) continue;

    const market = estimateByAddress.get(address);
    if (!market) continue; // never estimated before - don't guess, don't spend quota here

    const valueEstimate = estimatePropertyValue({
      assessedValue: row.assessedValueAtSale,
      market: {
        price: market.price,
        priceRangeLow: market.priceRangeLow,
        priceRangeHigh: market.priceRangeHigh,
        squareFootage: market.squareFootage,
        compAvgPricePerSqft: market.compAvgPricePerSqft,
        compCount: market.compCount ?? 0,
      },
    });

    if (valueEstimate.amount == null || !row.finalJudgmentAmount) continue;
    const ratio = valueEstimate.amount / row.finalJudgmentAmount;
    if (ratio < MIN_RATIO || ratio > MAX_RATIO) continue;

    const county = getCounty(row.countySlug);
    if (!county) continue;

    seenAddresses.add(address);
    deals.push({
      caseNumber: row.caseNumber,
      caseDetailUrl: row.caseDetailUrl,
      auctionDate: toISODate(row.auctionDate),
      finalJudgmentAmount: row.finalJudgmentAmount,
      estimatedMaxBid: row.estimatedMaxBid,
      propertyAddress: row.propertyAddress,
      zipCode: row.zipCode,
      assessedValue: row.assessedValueAtSale,
      parcelId: row.parcelId,
      parcelUrl: row.parcelUrl,
      valueEstimate,
      permits: null, // homepage teaser - skip permit lookups, keep this fast
      countyName: county.name,
      countySlug: county.slug,
      ratio,
    });
  }

  deals.sort((a, b) => b.ratio - a.ratio);
  const top = deals.slice(0, limit);
  return top.length >= MIN_RESULTS_TO_SHOW ? top : [];
}
