"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { lookupZip } from "@/lib/zipLookup";
import { toISODate } from "@/lib/dates";

export function ZipSearchBar({ variant = "header" }: { variant?: "header" | "hero" }) {
  const router = useRouter();
  const [zip, setZip] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = zip.trim();
    if (!/^\d{5}$/.test(trimmed)) {
      setMessage("Enter a 5-digit Florida zip code.");
      return;
    }

    const result = lookupZip(trimmed);
    if (result.status === "found") {
      setMessage(null);
      router.push(`/auctions/${result.county.slug}/${toISODate(new Date())}?zip=${trimmed}`);
    } else if (result.status === "unsupported-county") {
      setMessage(`${result.countyName} County isn't available yet - only some FL counties are wired up so far.`);
    } else {
      setMessage("That doesn't look like a Florida zip code.");
    }
  }

  const isHero = variant === "hero";

  return (
    <form onSubmit={handleSubmit} className={`flex flex-col gap-1 ${isHero ? "items-center" : ""}`}>
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          maxLength={5}
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="Zip code"
          aria-label="Florida zip code"
          className={
            isHero
              ? "w-40 rounded-md border border-border bg-surface px-4 py-2.5 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              : "w-28 rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white placeholder:text-white/50 focus:border-white/50 focus:outline-none"
          }
        />
        <button
          type="submit"
          className={
            isHero
              ? "rounded-md bg-accent px-5 py-2.5 text-base font-medium text-navy hover:opacity-90"
              : "rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-navy hover:opacity-90"
          }
        >
          Go
        </button>
      </div>
      {message ? (
        <p className={`max-w-xs text-xs ${isHero ? "text-center text-muted" : "text-white/70"}`}>{message}</p>
      ) : null}
    </form>
  );
}
