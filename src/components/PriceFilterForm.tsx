import Link from "next/link";
import type { PriceFilterBasis } from "@/lib/getAuctionListings";
import { PRICE_BASIS_LABELS } from "@/lib/filterParams";
import { formatMoney } from "@/lib/format";

// Plain GET form - no client JS needed, the browser just navigates to
// `action` with the submitted fields as a query string. `hiddenParams`
// carries along whatever scope/filters shouldn't be lost on submit (zip,
// and either a `dates` list or `month`/`year` - whichever the page it's
// rendered on is using to decide which dates to search).
export function PriceFilterForm({
  action,
  hiddenParams = {},
  zip,
  priceBasis,
  minPrice,
}: {
  action: string;
  hiddenParams?: Record<string, string | undefined>;
  zip?: string;
  priceBasis?: PriceFilterBasis;
  minPrice?: number;
}) {
  const active = priceBasis && minPrice != null;

  const clearParams = new URLSearchParams();
  for (const [key, value] of Object.entries(hiddenParams)) {
    if (value) clearParams.set(key, value);
  }
  const clearQs = clearParams.toString();

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3 text-sm">
      <form method="GET" action={action} className="flex flex-wrap items-center gap-2">
        {Object.entries(hiddenParams).map(([key, value]) =>
          value ? <input key={key} type="hidden" name={key} value={value} /> : null
        )}
        <span className="text-muted">
          {action.endsWith("/multi") ? "Across all these dates, show only" : "Show only"}
        </span>
        <select
          name="priceBasis"
          defaultValue={priceBasis ?? "estimate"}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
        >
          {(Object.keys(PRICE_BASIS_LABELS) as PriceFilterBasis[]).map((key) => (
            <option key={key} value={key}>
              {PRICE_BASIS_LABELS[key]}
            </option>
          ))}
        </select>
        <span className="text-muted">at least</span>
        <input
          type="number"
          name="minPrice"
          min={0}
          step={1000}
          defaultValue={minPrice ?? ""}
          placeholder="1000000"
          className="w-32 rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-accent px-3 py-1 text-sm font-medium text-navy hover:opacity-90"
        >
          Apply
        </button>
      </form>
      {active ? (
        <>
          <span className="text-muted">
            Filtering: {PRICE_BASIS_LABELS[priceBasis]} ≥ {formatMoney(minPrice)}
          </span>
          <Link href={`${action}${clearQs ? `?${clearQs}` : ""}`} className="text-accent hover:underline">
            Clear price filter
          </Link>
        </>
      ) : null}
    </div>
  );
}
