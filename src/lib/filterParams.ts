import type { ListingFilters, RangeFilter } from "@/lib/getAuctionListings";

export interface ActiveFilters {
  zip?: string;
  filters?: ListingFilters;
  counties?: string[];
}

function setRange(params: URLSearchParams, prefix: string, range: RangeFilter | undefined) {
  if (range?.min != null) params.set(`${prefix}Min`, String(range.min));
  if (range?.max != null) params.set(`${prefix}Max`, String(range.max));
}

/** Builds a "?a=b&c=d" query string (or "") from whichever filters are active - used to carry filters across day/month/calendar navigation links. */
export function buildFilterQueryString(active: ActiveFilters): string {
  const params = new URLSearchParams();
  if (active.zip) params.set("zip", active.zip);
  if (active.counties?.length) params.set("counties", active.counties.join(","));
  if (active.filters) {
    setRange(params, "judgment", active.filters.judgment);
    setRange(params, "maxBid", active.filters.maxBid);
    setRange(params, "estimate", active.filters.estimate);
    setRange(params, "assessed", active.filters.assessed);
    if (active.filters.minSpreadRatio != null) {
      params.set("minSpread", String(active.filters.minSpreadRatio));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function num(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseRange(params: FilterSearchParams, prefix: "judgment" | "maxBid" | "estimate" | "assessed"): RangeFilter | undefined {
  const min = num(params[`${prefix}Min`]);
  const max = num(params[`${prefix}Max`]);
  return min != null || max != null ? { min, max } : undefined;
}

export interface FilterSearchParams {
  judgmentMin?: string;
  judgmentMax?: string;
  maxBidMin?: string;
  maxBidMax?: string;
  estimateMin?: string;
  estimateMax?: string;
  assessedMin?: string;
  assessedMax?: string;
  minSpread?: string;
}

/** Parses the rich filter query params (as read from a page's searchParams) back into a ListingFilters - centralizes parsing that would otherwise be duplicated across every page that offers filtering. Returns undefined if nothing is actually set. */
export function parseListingFilters(params: FilterSearchParams): ListingFilters | undefined {
  const filters: ListingFilters = {
    judgment: parseRange(params, "judgment"),
    maxBid: parseRange(params, "maxBid"),
    estimate: parseRange(params, "estimate"),
    assessed: parseRange(params, "assessed"),
    minSpreadRatio: num(params.minSpread),
  };
  const hasAny = Object.values(filters).some((v) => v !== undefined);
  return hasAny ? filters : undefined;
}

export const FIELD_LABELS = {
  judgment: "Final Judgment",
  maxBid: "Est. Max Bid",
  estimate: "Value Estimate",
  assessed: "Tax Assessed Value",
} as const;
