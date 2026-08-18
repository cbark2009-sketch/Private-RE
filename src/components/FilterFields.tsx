import type { ListingFilters } from "@/lib/getAuctionListings";
import { FIELD_LABELS } from "@/lib/filterParams";

export const RANGE_FIELDS = [
  { key: "judgment", param: "judgment", note: null },
  { key: "maxBid", param: "maxBid", note: "Currently calculated as equal to Final Judgment - see the note on each listing." },
  { key: "estimate", param: "estimate", note: null },
  { key: "assessed", param: "assessed", note: null },
] as const;

export function countActiveFilters(filters: ListingFilters | undefined): number {
  if (!filters) return 0;
  let n = 0;
  for (const f of RANGE_FIELDS) {
    const range = filters[f.key];
    if (range?.min != null) n++;
    if (range?.max != null) n++;
  }
  if (filters.minSpreadRatio != null) n++;
  return n;
}

/**
 * The raw min/max + spread inputs shared between `FiltersPanel` (popover, on
 * the single/multi-date pages) and the cross-county search page (shown
 * inline, not behind a popover, since that page exists specifically for
 * setting up a detailed search). No `<form>` wrapper here on purpose - the
 * caller owns the form so these can sit alongside other fields (e.g. a
 * county picker) inside one submission.
 */
export function FilterFields({ initialFilters }: { initialFilters?: ListingFilters }) {
  return (
    <>
      {RANGE_FIELDS.map((f) => (
        <div key={f.key}>
          <label className="text-xs font-medium text-foreground">{FIELD_LABELS[f.key]}</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              name={`${f.param}Min`}
              min={0}
              step={1000}
              defaultValue={initialFilters?.[f.key]?.min ?? ""}
              placeholder="Min"
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
            />
            <span className="text-muted">–</span>
            <input
              type="number"
              name={`${f.param}Max`}
              min={0}
              step={1000}
              defaultValue={initialFilters?.[f.key]?.max ?? ""}
              placeholder="Max"
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
            />
          </div>
          {f.note ? <p className="mt-0.5 text-[11px] text-muted">{f.note}</p> : null}
        </div>
      ))}

      <div className="border-t border-border pt-3">
        <label className="text-xs font-medium text-foreground">Good-deal spread</label>
        <div className="mt-1 flex items-center gap-1.5 text-sm text-muted">
          <span>Value Estimate is at least</span>
          <input
            type="number"
            name="minSpread"
            min={1}
            step={0.1}
            defaultValue={initialFilters?.minSpreadRatio ?? ""}
            placeholder="1.3"
            className="w-16 rounded-md border border-border bg-background px-2 py-1 text-sm"
          />
          <span>× Final Judgment</span>
        </div>
      </div>
    </>
  );
}
