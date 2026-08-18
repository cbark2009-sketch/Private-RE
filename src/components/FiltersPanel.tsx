"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ListingFilters } from "@/lib/getAuctionListings";
import { FilterFields, countActiveFilters } from "@/components/FilterFields";

/**
 * Button-triggered popover for setting Judgment/Max Bid/Value Estimate/Tax
 * Assessed ranges and a min spread ratio all at once (AND across every field
 * that's actually set) - same interaction pattern as the 📅 Calendar button.
 * Plain GET form, no client JS needed to submit - `action`/`hiddenParams`
 * let this be reused on the single-county page and the multi-date page
 * without hardcoding a route.
 */
export function FiltersPanel({
  action,
  hiddenParams = {},
  initialFilters,
}: {
  action: string;
  hiddenParams?: Record<string, string | undefined>;
  initialFilters?: ListingFilters;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeCount = countActiveFilters(initialFilters);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const clearParams = new URLSearchParams();
  for (const [key, value] of Object.entries(hiddenParams)) {
    if (value) clearParams.set(key, value);
  }
  const clearQs = clearParams.toString();

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:bg-background"
        aria-expanded={open}
      >
        🔍 Filters{activeCount > 0 ? ` (${activeCount})` : ""}
      </button>

      {open ? (
        <div className="absolute z-20 mt-2 w-[22rem] rounded-lg border border-border bg-surface p-4 shadow-lg">
          <form method="GET" action={action} className="flex flex-col gap-3">
            {Object.entries(hiddenParams).map(([key, value]) =>
              value ? <input key={key} type="hidden" name={key} value={value} /> : null
            )}

            <FilterFields initialFilters={initialFilters} />

            <button
              type="submit"
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-navy hover:opacity-90"
            >
              Apply
            </button>
            {activeCount > 0 ? (
              <Link
                href={`${action}${clearQs ? `?${clearQs}` : ""}`}
                onClick={() => setOpen(false)}
                className="text-center text-xs text-muted hover:underline"
              >
                Clear all filters
              </Link>
            ) : null}
          </form>
        </div>
      ) : null}
    </div>
  );
}
