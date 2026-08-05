import Link from "next/link";
import { notFound } from "next/navigation";
import { getMultiDateListings, getActiveDatesInMonth } from "@/lib/getMultiDateListings";
import { isValidISODate } from "@/lib/dates";
import { getCounty } from "@/lib/counties";
import { PRICE_BASIS_LABELS } from "@/lib/filterParams";
import type { PriceFilterBasis } from "@/lib/getAuctionListings";
import { ListingCard } from "@/components/ListingCard";
import { PriceFilterForm } from "@/components/PriceFilterForm";

export const dynamic = "force-dynamic";

const PRICE_BASES = new Set(Object.keys(PRICE_BASIS_LABELS));

export default async function MultiDatePage({
  params,
  searchParams,
}: {
  params: Promise<{ county: string }>;
  searchParams: Promise<{
    dates?: string;
    month?: string;
    year?: string;
    zip?: string;
    priceBasis?: string;
    minPrice?: string;
  }>;
}) {
  const { county: countySlug } = await params;
  const { dates, month, year, zip, priceBasis, minPrice } = await searchParams;

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

  // Scope is either an explicit date list (calendar multi-select) or "every
  // active date in this month" (price-filter "search all dates" path).
  let dateList: string[];
  let scopeLabel: string;
  const y = year ? Number(year) : NaN;
  const m = month ? Number(month) : NaN;

  if (dates) {
    dateList = dates.split(",").filter(isValidISODate);
    scopeLabel = `${dateList.length} selected day${dateList.length === 1 ? "" : "s"}`;
  } else if (Number.isInteger(y) && Number.isInteger(m) && m >= 1 && m <= 12) {
    dateList = await getActiveDatesInMonth(countySlug, y, m).catch((err) => {
      console.error(`Failed to resolve active dates for ${countySlug} ${y}-${m}:`, err);
      return [];
    });
    scopeLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  } else {
    notFound();
  }

  let listings;
  let error: string | null = null;
  try {
    listings = await getMultiDateListings(countySlug, dateList, zipFilter, priceFilter);
  } catch (err) {
    console.error(err);
    listings = [];
    error = "Something went wrong loading these dates. Check the server logs for details.";
  }

  const backHref = `/auctions/${county.slug}/${dateList[0] ?? new Date().toISOString().slice(0, 10)}`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-4 sm:px-6">
        <Link
          href={backHref}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:bg-background"
        >
          ← Back to day view
        </Link>
        <h1 className="text-lg font-semibold text-foreground">
          {county.name} County · Across {scopeLabel}
          {zipFilter ? ` · ${zipFilter}` : ""}
        </h1>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <PriceFilterForm
          action={`/auctions/${county.slug}/multi`}
          hiddenParams={{ dates: dates ?? undefined, month, year, zip: zipFilter }}
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
