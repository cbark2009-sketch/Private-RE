import type { PriceFilterBasis } from "@/lib/getAuctionListings";

export interface ActiveFilters {
  zip?: string;
  priceBasis?: PriceFilterBasis;
  minPrice?: number;
}

/** Builds a "?a=b&c=d" query string (or "") from whichever filters are active - used to carry filters across day/month navigation links. */
export function buildFilterQueryString(filters: ActiveFilters): string {
  const params = new URLSearchParams();
  if (filters.zip) params.set("zip", filters.zip);
  if (filters.priceBasis && filters.minPrice != null) {
    params.set("priceBasis", filters.priceBasis);
    params.set("minPrice", String(filters.minPrice));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const PRICE_BASIS_LABELS: Record<PriceFilterBasis, string> = {
  judgment: "Final Judgment",
  estimate: "Value Estimate",
  assessed: "Tax Assessed Value",
};
