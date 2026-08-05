// Deliberately transparent estimates. All are clearly labeled in the UI as
// estimates, not facts, because that's the whole point of this tool: don't
// repeat the mistake of presenting a guess as if it were precise.

/**
 * The real plaintiff max bid is hidden until the auction actually happens.
 * In practice, the foreclosing plaintiff (almost always the lender) usually
 * "credit bids" up to the judgment amount, since they don't have to pay cash
 * for that portion - they're owed it already. So the judgment amount itself
 * is the standard real-world estimate. This is a heuristic, not scraped
 * data, and is labeled as such everywhere it's shown.
 */
export function estimateMaxBid(finalJudgmentAmount: number | null): number | null {
  return finalJudgmentAmount;
}

export interface ValueEstimate {
  amount: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  basis: "market-comps" | "county-assessed-value" | "unavailable";
  note: string;
  compAvgPricePerSqft: number | null;
  compCount: number | null;
  subjectSquareFootage: number | null;
}

/**
 * Prefers a real comp-based market estimate (RentCast's /avm/value - see
 * getMarketEstimate.ts) over the county's tax-assessed value. We show
 * RentCast's own price + range AND our own avg-$/sqft-across-comps
 * calculation side by side, since the whole point of this tool is showing
 * the reasoning, not just a number - a naive fudge-factor multiplier on
 * assessed value would be less honest than Zillow, not more.
 */
export function estimatePropertyValue(input: {
  assessedValue: number | null;
  market: {
    price: number | null;
    priceRangeLow: number | null;
    priceRangeHigh: number | null;
    squareFootage: number | null;
    compAvgPricePerSqft: number | null;
    compCount: number;
  } | null;
}): ValueEstimate {
  if (input.market?.price != null) {
    const compNote =
      input.market.compCount > 0 && input.market.compAvgPricePerSqft != null
        ? ` Nearby comps (${input.market.compCount} listings) averaged ${Math.round(
            input.market.compAvgPricePerSqft
          ).toLocaleString("en-US", { style: "currency", currency: "USD" })}/sqft - note these are` +
          " comparable *listings*, not confirmed sold prices, so treat them as directional."
        : "";
    return {
      amount: input.market.price,
      rangeLow: input.market.priceRangeLow,
      rangeHigh: input.market.priceRangeHigh,
      basis: "market-comps",
      compAvgPricePerSqft: input.market.compAvgPricePerSqft,
      compCount: input.market.compCount,
      subjectSquareFootage: input.market.squareFootage,
      note:
        "A comp-based automated estimate (RentCast), not the tax-assessed value - this is what the tool was " +
        "actually built to do instead of relying on assessed value. Still doesn't specifically detect " +
        "renovations or rebuilds, so treat the range as more meaningful than the single number." + compNote,
    };
  }
  if (input.assessedValue != null) {
    return {
      amount: input.assessedValue,
      rangeLow: null,
      rangeHigh: null,
      basis: "county-assessed-value",
      compAvgPricePerSqft: null,
      compCount: null,
      subjectSquareFootage: null,
      note:
        "Fallback: no market estimate was available, so this is just the tax-assessed value, which is often " +
        "below true market value (and, for homesteaded properties, is capped by Florida's Save Our Homes law " +
        "regardless of what's happened to the home). Treat this as a rough floor, not a sale-price estimate.",
    };
  }
  return {
    amount: null,
    rangeLow: null,
    rangeHigh: null,
    basis: "unavailable",
    compAvgPricePerSqft: null,
    compCount: null,
    subjectSquareFootage: null,
    note: "No value data was available for this property.",
  };
}
