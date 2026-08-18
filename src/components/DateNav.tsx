import Link from "next/link";
import { addDays, formatDisplayDate, toISODate } from "@/lib/dates";
import type { County } from "@/lib/counties";
import type { DayCount } from "@/lib/scrapeCalendar";
import type { ListingFilters } from "@/lib/getAuctionListings";
import { buildFilterQueryString } from "@/lib/filterParams";
import { AuctionCalendar } from "@/components/AuctionCalendar";

export function DateNav({
  county,
  date,
  zip,
  filters,
  calendarDays,
}: {
  county: County;
  date: string;
  zip?: string;
  filters?: ListingFilters;
  calendarDays: DayCount[];
}) {
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  const today = toISODate(new Date());
  const qs = buildFilterQueryString({ zip, filters });
  const [year, month] = date.split("-").map(Number);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-4 sm:px-6">
      <div className="flex items-center gap-2">
        <Link
          href={`/auctions/${county.slug}/${prev}${qs}`}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:bg-background"
        >
          ← Previous day
        </Link>
        <Link
          href={`/auctions/${county.slug}/${next}${qs}`}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:bg-background"
        >
          Next day →
        </Link>
        {date !== today ? (
          <Link
            href={`/auctions/${county.slug}/${today}${qs}`}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-accent hover:underline"
          >
            Jump to today
          </Link>
        ) : null}
        <AuctionCalendar
          county={county}
          selectedDate={date}
          zip={zip}
          filters={filters}
          initialYear={year}
          initialMonth={month}
          initialDays={calendarDays}
        />
      </div>
      <h1 className="text-lg font-semibold text-foreground">
        {county.name} County{zip ? ` · ${zip}` : ""} · {formatDisplayDate(date)}
      </h1>
    </div>
  );
}
