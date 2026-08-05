import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuctionListings } from "@/lib/getAuctionListings";
import { getCalendarMonth, getCalendarMonthForZip } from "@/lib/getCalendarMonth";
import { isValidISODate } from "@/lib/dates";
import { getCounty } from "@/lib/counties";
import { DateNav } from "@/components/DateNav";
import { ListingCard } from "@/components/ListingCard";
import { PriceFilterForm } from "@/components/PriceFilterForm";

export const dynamic = "force-dynamic";

export default async function AuctionDatePage({
  params,
  searchParams,
}: {
  params: Promise<{ county: string; date: string }>;
  searchParams: Promise<{ zip?: string }>;
}) {
  const { county: countySlug, date } = await params;
  const { zip } = await searchParams;
  if (!isValidISODate(date)) notFound();

  const county = getCounty(countySlug);
  if (!county) notFound();

  const zipFilter = zip && /^\d{5}$/.test(zip) ? zip : undefined;

  let listings;
  let error: string | null = null;
  try {
    listings = await getAuctionListings(countySlug, date, zipFilter);
  } catch (err) {
    console.error(err);
    listings = [];
    error = "Something went wrong loading this date. Check the server logs for details.";
  }

  const [year, month] = date.split("-").map(Number);
  const calendarDays = await (zipFilter
    ? getCalendarMonthForZip(countySlug, year, month, zipFilter)
    : getCalendarMonth(countySlug, year, month)
  ).catch((err) => {
    console.error(`Calendar fetch failed for ${countySlug} ${year}-${month} (zip=${zipFilter}):`, err);
    return [];
  });

  const basePath = `/auctions/${county.slug}/${date}`;
  const scopeLabel = zipFilter ? `zip ${zipFilter}` : `${county.name} County`;

  return (
    <div>
      <DateNav county={county} date={date} zip={zipFilter} calendarDays={calendarDays} />
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {zipFilter ? (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>
              Showing only <strong className="text-foreground">{zipFilter}</strong> within{" "}
              {county.name} County
            </span>
            <Link href={basePath} className="text-accent hover:underline">
              Clear filter, show whole county
            </Link>
          </div>
        ) : null}

        {/* Price filtering searches every active date in this month at once (not just
            today) - see /multi. Submitting here jumps you there with this month
            pre-selected. */}
        <PriceFilterForm
          action={`/auctions/${county.slug}/multi`}
          hiddenParams={{ month: String(month), year: String(year), zip: zipFilter }}
        />

        {error ? (
          <p className="rounded-lg border border-estimate bg-estimate-soft p-4 text-sm text-estimate">
            {error}
          </p>
        ) : listings.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-muted">
            No auctions listed for this date in {scopeLabel}.
            {zipFilter ? " There may still be auctions elsewhere in the county today." : ""}
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted">
              {listings.length} case{listings.length === 1 ? "" : "s"} scheduled in {scopeLabel}
            </p>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((listing) => (
                <ListingCard key={listing.caseNumber} listing={listing} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
