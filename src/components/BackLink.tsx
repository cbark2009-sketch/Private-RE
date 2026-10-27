"use client";

import { useRouter } from "next/navigation";

/**
 * "Back" that returns to wherever the person came from (the map, a search,
 * a day page, favorites) with that page's state intact, instead of always
 * dumping them on the homepage. Falls back to the homepage when there's no
 * history to go back to, e.g. a link opened in a new tab.
 */
export function BackLink() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
      className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:bg-surface"
    >
      ← Back
    </button>
  );
}
