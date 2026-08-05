"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { County } from "@/lib/counties";
import type { DayCount } from "@/lib/scrapeCalendar";
import type { PriceFilterBasis } from "@/lib/getAuctionListings";
import { buildFilterQueryString } from "@/lib/filterParams";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function firstWeekday(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

export function AuctionCalendar({
  county,
  selectedDate,
  zip,
  priceBasis,
  minPrice,
  initialYear,
  initialMonth,
  initialDays,
}: {
  county: County;
  selectedDate: string;
  zip?: string;
  priceBasis?: PriceFilterBasis;
  minPrice?: number;
  initialYear: number;
  initialMonth: number;
  initialDays: DayCount[];
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [days, setDays] = useState<DayCount[]>(initialDays);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const cache = useRef(new Map<string, DayCount[]>([[`${initialYear}-${initialMonth}-${zip ?? ""}`, initialDays]]));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function goToMonth(y: number, m: number) {
    setYear(y);
    setMonth(m);
    const key = `${y}-${m}-${zip ?? ""}`;
    const hit = cache.current.get(key);
    if (hit) {
      setDays(hit);
      return;
    }
    setLoading(true);
    try {
      const url = `/api/calendar/${county.slug}/${y}/${m}${zip ? `?zip=${zip}` : ""}`;
      const res = await fetch(url);
      const json = await res.json();
      const fetched: DayCount[] = res.ok ? json.days : [];
      cache.current.set(key, fetched);
      setDays(fetched);
    } finally {
      setLoading(false);
    }
  }

  function togglePicked(date: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  const byDate = new Map(days.map((d) => [d.date, d]));
  const leadingBlanks = firstWeekday(year, month);
  const totalDays = daysInMonth(year, month);
  const filterQs = buildFilterQueryString({ zip, priceBasis, minPrice });
  const pickedList = [...picked].sort();
  const multiHref =
    `/auctions/${county.slug}/multi?dates=${pickedList.join(",")}` +
    (zip ? `&zip=${zip}` : "") +
    (priceBasis && minPrice != null ? `&priceBasis=${priceBasis}&minPrice=${minPrice}` : "");

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:bg-background"
        aria-expanded={open}
      >
        📅 Calendar
      </button>

      {open ? (
        <div className="absolute z-20 mt-2 w-80 rounded-lg border border-border bg-surface p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => goToMonth(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1)}
              className="rounded px-2 py-1 text-sm text-muted hover:bg-background"
              aria-label="Previous month"
            >
              ←
            </button>
            <span className="text-sm font-semibold text-foreground">
              {MONTH_NAMES[month - 1]} {year}
            </span>
            <button
              type="button"
              onClick={() => goToMonth(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1)}
              className="rounded px-2 py-1 text-sm text-muted hover:bg-background"
              aria-label="Next month"
            >
              →
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="py-1">{d}</div>
            ))}
          </div>

          <div className={`grid grid-cols-7 gap-1 ${loading ? "opacity-40" : ""}`}>
            {Array.from({ length: leadingBlanks }).map((_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => {
              const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const info = byDate.get(date);
              const isViewing = date === selectedDate;
              const isPicked = picked.has(date);
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => togglePicked(date)}
                  aria-pressed={isPicked}
                  title={isViewing ? "Currently viewing" : "Click to select"}
                  className={`flex flex-col items-center rounded-md py-1.5 text-xs hover:bg-accent-soft ${
                    isPicked
                      ? "bg-accent text-navy ring-2 ring-accent"
                      : isViewing
                        ? "bg-accent-soft ring-1 ring-accent"
                        : ""
                  }`}
                >
                  <span className={isPicked ? "text-navy" : "text-foreground"}>{day}</span>
                  {info ? (
                    <span
                      className={`mt-0.5 rounded-full px-1.5 text-[10px] font-semibold ${
                        isPicked
                          ? "bg-navy/20 text-navy"
                          : info.active > 0
                            ? "bg-estimate-soft text-estimate"
                            : "bg-border text-muted"
                      }`}
                    >
                      {info.active}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <Link
              href={`/auctions/${county.slug}/${selectedDate}${filterQs}`}
              onClick={() => setOpen(false)}
              className="text-xs text-muted hover:underline"
            >
              ↩ Back to day view
            </Link>
            {picked.size > 0 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPicked(new Set())}
                  className="text-xs text-muted hover:underline"
                >
                  Clear ({picked.size})
                </button>
                <Link
                  href={multiHref}
                  onClick={() => setOpen(false)}
                  className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-navy hover:opacity-90"
                >
                  View {picked.size} day{picked.size === 1 ? "" : "s"}
                </Link>
              </div>
            ) : (
              <span className="text-[10px] text-muted">Click days to select multiple</span>
            )}
          </div>

          <p className="mt-2 text-[10px] leading-snug text-muted">
            {zip
              ? `Number shown is how many active auctions that day are in zip ${zip} specifically.`
              : "Number shown is auctions still active/waiting for that day per the county's own calendar - may differ slightly from what appears after this app's own filtering."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
