"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { MapPoint } from "@/lib/getMapPoints";
import type { Coordinates } from "@/lib/geocode";
import { DOT_COLORS, type PlacedPoint } from "@/lib/mapDots";

const AuctionMapCanvas = dynamic(() => import("@/components/AuctionMapCanvas").then((m) => m.AuctionMapCanvas), {
  ssr: false,
  loading: () => <div className="flex h-full w-full items-center justify-center text-sm text-muted">Loading map…</div>,
});

// Same as MAX_ADDRESSES_PER_REQUEST in src/lib/geocode.ts - not imported from
// there because that module pulls in the database client.
const ADDRESSES_PER_REQUEST = 100;

/**
 * The homepage map. Dots whose address is already geocoded show immediately;
 * the rest are sent to /api/geocode in batches after the page loads, and
 * appear as each batch comes back - so the page itself never waits on the
 * Census geocoder. Give it a `key` that changes per search so a new set of
 * results starts fresh instead of keeping the previous search's state.
 */
export function AuctionMap({ points, caption }: { points: MapPoint[]; caption: string }) {
  const pending = useMemo(
    () => [...new Set(points.filter((p) => !p.coords && !p.unlocatable).map((p) => p.address))],
    [points]
  );
  const [located, setLocated] = useState<Map<string, Coordinates | null>>(() => new Map());
  const [inFlight, setInFlight] = useState(pending.length > 0);
  const [requestFailed, setRequestFailed] = useState(false);

  useEffect(() => {
    if (pending.length === 0) return;
    let cancelled = false;

    (async () => {
      for (let i = 0; i < pending.length; i += ADDRESSES_PER_REQUEST) {
        const chunk = pending.slice(i, i + ADDRESSES_PER_REQUEST);
        try {
          const res = await fetch("/api/geocode", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ addresses: chunk }),
          });
          if (!res.ok) throw new Error(`Geocode request failed: ${res.status}`);
          const { results } = (await res.json()) as { results: Record<string, Coordinates | null> };
          if (cancelled) return;
          setLocated((prev) => {
            const next = new Map(prev);
            for (const address of chunk) next.set(address, results[address] ?? null);
            return next;
          });
        } catch (err) {
          console.error(err);
          if (!cancelled) setRequestFailed(true);
          break;
        }
      }
      if (!cancelled) setInFlight(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [pending]);

  const placed = useMemo(
    () =>
      points.flatMap((p): PlacedPoint[] => {
        const coords = p.coords ?? located.get(p.address);
        return coords ? [{ ...p, coords }] : [];
      }),
    [points, located]
  );

  const stillPlacing = inFlight ? pending.filter((a) => !located.has(a)).length : 0;
  const unplaced = inFlight ? 0 : points.length - placed.length;

  return (
    <div>
      <div className="relative h-[420px] overflow-hidden rounded-lg border border-border bg-border lg:h-[calc(100vh-9rem)] lg:min-h-[520px]">
        <AuctionMapCanvas points={placed} settled={!inFlight} />

        <div className="pointer-events-none absolute left-3 top-3 z-[1000] rounded-full bg-navy/90 px-3 py-1.5 text-sm font-semibold text-white shadow">
          Showing {placed.length}
          {stillPlacing > 0 ? <span className="font-normal text-white/70"> · placing {stillPlacing} more…</span> : null}
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] flex flex-col gap-1 rounded-md bg-surface/95 px-2.5 py-2 text-[11px] text-foreground shadow">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: DOT_COLORS.foreclosure }} />
            Foreclosure
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: DOT_COLORS.hoa }} />
            Likely HOA/lien case
          </span>
        </div>
      </div>

      <p className="mt-2 text-xs text-muted">
        {caption}
        {unplaced > 0 ? ` ${unplaced} couldn't be placed on the map from their address.` : ""}
        {requestFailed ? " The address lookup service didn't respond, so some dots may be missing - try reloading." : ""}
      </p>
    </div>
  );
}
