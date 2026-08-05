"use client";

import { useRouter } from "next/navigation";
import { COUNTIES } from "@/lib/counties";
import { toISODate } from "@/lib/dates";

export function CountySelect({ currentSlug }: { currentSlug?: string }) {
  const router = useRouter();

  return (
    <select
      aria-label="Browse a Florida county"
      value={currentSlug ?? ""}
      onChange={(e) => {
        if (e.target.value) router.push(`/auctions/${e.target.value}/${toISODate(new Date())}`);
      }}
      className="rounded-md border border-white/20 bg-white/10 px-2 py-1.5 text-sm text-white focus:border-white/50 focus:outline-none [&>option]:text-navy"
    >
      <option value="" disabled>
        Browse a county…
      </option>
      {COUNTIES.map((c) => (
        <option key={c.slug} value={c.slug}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
