"use client";

import { useState } from "react";
import { COUNTIES } from "@/lib/counties";

export const MAX_COUNTIES_PER_SEARCH = 4;

/**
 * Checkbox grid for picking which counties a cross-county search should
 * actually scrape live. No `<form>` wrapper - the search page owns the
 * form so this sits alongside the filter fields in one submission (each
 * checkbox is just `name="counties"`, which Next.js's searchParams already
 * gives back as a string[] when repeated - no extra JS needed for that
 * part). The live count + cap warning here is the only thing that needs
 * client state.
 */
export function CountyPicker({ initialSelected = [] }: { initialSelected?: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));
  const sorted = [...COUNTIES].sort((a, b) => a.name.localeCompare(b.name));
  const overCap = selected.size > MAX_COUNTIES_PER_SEARCH;

  function toggle(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-medium text-foreground">Counties to search live</label>
        <span className={`text-xs ${overCap ? "font-semibold text-estimate" : "text-muted"}`}>
          {selected.size} / {MAX_COUNTIES_PER_SEARCH}
        </span>
      </div>
      <div className="mt-1 grid max-h-48 grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto rounded-md border border-border bg-background p-2 sm:grid-cols-3">
        {sorted.map((c) => (
          <label key={c.slug} className="flex items-center gap-1.5 text-sm text-foreground">
            <input
              type="checkbox"
              name="counties"
              value={c.slug}
              checked={selected.has(c.slug)}
              onChange={() => toggle(c.slug)}
              className="accent-accent"
            />
            {c.name}
          </label>
        ))}
      </div>
      {overCap ? (
        <p className="mt-1 text-[11px] text-estimate">
          Search is limited to {MAX_COUNTIES_PER_SEARCH} counties at a time so it stays fast - remove{" "}
          {selected.size - MAX_COUNTIES_PER_SEARCH} to continue.
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-muted">
          Each selected county gets checked live, one at a time - up to {MAX_COUNTIES_PER_SEARCH} at once.
        </p>
      )}
      <button
        type="submit"
        disabled={selected.size === 0 || overCap}
        className="mt-3 w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-navy hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Search {selected.size > 0 ? `${selected.size} count${selected.size === 1 ? "y" : "ies"}` : ""}
      </button>
    </div>
  );
}
