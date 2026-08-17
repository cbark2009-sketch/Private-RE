import Link from "next/link";
import { notFound } from "next/navigation";
import { getMultiDateListings, getActiveDatesAcrossMonths } from "@/lib/getMultiDateListings";
import { getCalendarMonth, getCalendarMonthForZip } from "@/lib/getCalendarMonth";
import { isValidISODate } from "@/lib/dates";
import { getCounty } from "@/lib/counties";
import { PRICE_BASIS_LABELS } from "@/lib/filterParams";
import type { PriceFilterBasis, AuctionListingView } from "@/lib/getAuctionListings";
import { ListingCard } from "@/components/ListingCard";
import { PriceFilterForm } from "@/components/PriceFilterForm";
import { AuctionCalendar } from "@/components/AuctionCalendar";

export const dynamic = "force-dynamic";

const PRICE_BASES = new Set(Object.keys(PRICE_BASIS_LABELS));

export default async function MultiDatePage({
  params,
  searchParams,
}: {
  params: Promise<{ county: string }>;
  searchParams: Promise<{
    dates?: string;
    zip?: string;
    priceBasis?: string;
    minPrice?: string;
  }>;
}) {
  const { county: countySlug } = await params;
  const { dates, zip, priceBasis, minPrice } = await searchParams;

  const county = getCounty(countySlug);
  if (!county) notFound();

  const zipFilter = zip && /^\d{5}$/.test(zip) ? zip : undefined;
  const minPriceNum = minPrice ? Number(minPrice) : NaN;
  const priceBasisValid =
    priceBasis && PRICE_BASES.has(priceBasis) ? (priceBasis as PriceFilterBasis) : undefined;
  const priceFilter =
    priceBasisValid && Number.isFinite(minPriceNum) && minPriceNum > 0
      ? { basis: priceBasisValid, min: minPriceNum }
      : undefined;

  // Scope is either an explicit date list (calendar multi-select) or
  // "everything currently posted" (the price-filter path) - the latter
  // deliberately ignores whatever month/day happened to be in view when the
  // filter was submitted, scanning forward from today instead, so applying
  // a filter never silently misses listings just because of which page you
  // applied it from.
  let dateList: string[];
  let scopeLabel: string;

  if (dates) {
    dateList = dates.split(",").filter(isValidISODate);
    scopeLabel = `${dateList.length} selected day${dateList.length === 1 ? "" : "s"}`;
  } else {
    const today = new Date();
    dateList = await getActiveDatesAcrossMonths(countySlug, today.getUTCFullYear(), today.getUTCMonth() + 1).catch(
      (err) => {
        console.error(`Failed to resolve active dates for ${countySlug}:`, err);
        return [];
      }
    );
    scopeLabel = "every upcoming date";
  }

  let listings: AuctionListingView[];
  let error: string | null = null;
  try {
    listings = await getMultiDateListings(countySlug, dateList, zipFilter, priceFilter);
  } catch (err) {
    console.error(err);
    listings = [];
    error = "Something went wrong loading these dates. Check the server logs for details.";
  }

  const firstDate = dateList[0] ?? new Date().toISOString().slice(0, 10);
  const backHref = `/auctions/${county.slug}/${firstDate}`;

  // The calendar shown here needs a month to open on - the month of the
  // earliest matching date is a reasonable default either way (an explicit
  // selection's first day, or the first upcoming active date found).
  const [calYear, calMonth] = firstDate.split("-").map(Number);
  const calendarDays = await (zipFilter
    ? getCalendarMonthForZip(countySlug, calYear, calMonth, zipFilter)
    : getCalendarMonth(countySlug, calYear, calMonth)
  ).catch((err) => {
    console.error(`Calendar fetch failed for ${countySlug} ${calYear}-${calMonth} (zip=${zipFilter}):`, err);
    return [];
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <Link
            href={backHref}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:bg-background"
          >
            ← Back to day view
          </Link>
          <AuctionCalendar
            county={county}
            selectedDate={firstDate}
            zip={zipFilter}
            priceBasis={priceFilter?.basis}
            minPrice={priceFilter?.min}
            initialYear={calYear}
            initialMonth={calMonth}
            initialDays={calendarDays}
            initialPicked={dates ? dateList : []}
          />
        </div>
        <h1 className="text-lg font-semibold text-foreground">
          {county.name} County · Across {scopeLabel}
          {zipFilter ? ` · ${zipFilter}` : ""}
        </h1>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <PriceFilterForm
          action={`/auctions/${county.slug}/multi`}
          hiddenParams={{ dates: dates ?? undefined, zip: zipFilter }}
          zip={zipFilter}
          priceBasis={priceFilter?.basis}
          minPrice={priceFilter?.min}
        />

        {error ? (
          <p className="rounded-lg border border-estimate bg-estimate-soft p-4 text-sm text-estimate">
            {error}
          </p>
        ) : dateList.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-muted">
            No active auction dates found for this scope.
          </p>
        ) : listings.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-muted">
            No listings across {scopeLabel} matched
            {priceFilter ? ` ${PRICE_BASIS_LABELS[priceFilter.basis]} ≥ $${priceFilter.min.toLocaleString()}` : " your filters"}.
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted">
              {listings.length} case{listings.length === 1 ? "" : "s"} across {scopeLabel}
            </p>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((listing) => (
                <ListingCard key={`${listing.auctionDate}-${listing.caseNumber}`} listing={listing} showDate />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
