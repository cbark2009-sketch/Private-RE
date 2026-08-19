import { getListingsAcrossCounties, DEFAULT_RANGE_DAYS } from "@/lib/getMultiDateListings";
import { getGoodDeals } from "@/lib/getGoodDeals";
import { getCounty } from "@/lib/counties";
import { isValidISODate } from "@/lib/dates";
import { parseListingFilters, type FilterSearchParams } from "@/lib/filterParams";
import { ListingCard } from "@/components/ListingCard";
import { CountyPicker, MAX_COUNTIES_PER_SEARCH } from "@/components/CountyPicker";
import { FilterFields } from "@/components/FilterFields";

// Without this, Next.js prerenders the page once at build time and serves
// that same static HTML to everyone - both the good-deals section and any
// search results would freeze at whatever was true the moment of the last
// deploy. Same pattern as every other data-driven page in the app.
export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ counties?: string | string[]; zip?: string; dateFrom?: string; dateTo?: string } & FilterSearchParams>;
}) {
  const resolved = await searchParams;
  const { zip, dateFrom, dateTo } = resolved;

  const requestedSlugs = (Array.isArray(resolved.counties) ? resolved.counties : resolved.counties ? [resolved.counties] : [])
    .filter((slug, i, arr) => arr.indexOf(slug) === i) // dedupe
    .filter((slug) => getCounty(slug));

  const zipFilter = zip && /^\d{5}$/.test(zip) ? zip : undefined;
  const filters = parseListingFilters(resolved);
  const hasSearched = requestedSlugs.length > 0;
  const overCap = requestedSlugs.length > MAX_COUNTIES_PER_SEARCH;

  const fromValid = dateFrom && isValidISODate(dateFrom) ? dateFrom : undefined;
  const toValid = dateTo && isValidISODate(dateTo) ? dateTo : undefined;

  const goodDeals = hasSearched
    ? []
    : await getGoodDeals().catch((err) => {
        console.error("Failed to load good deals:", err);
        return [];
      });

  let listings: Awaited<ReturnType<typeof getListingsAcrossCounties>>["listings"] = [];
  let truncated: Awaited<ReturnType<typeof getListingsAcrossCounties>>["truncated"] = [];
  let error: string | null = null;
  if (hasSearched && !overCap) {
    try {
      const result = await getListingsAcrossCounties(requestedSlugs, zipFilter, filters, { from: fromValid, to: toValid });
      listings = result.listings;
      truncated = result.truncated;
    } catch (err) {
      console.error("Cross-county search failed:", err);
      error = "Something went wrong loading these counties. Check the server logs for details.";
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {goodDeals.length > 0 ? (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground">Possibly good deals</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Upcoming listings whose estimated value comes in well above the judgment amount -
            across every county browsed so far. This is a starting filter, not a recommendation:
            a low judgment can also mean this is a junior lien (an HOA foreclosure, most often) -
            winning the auction clears <em>that</em> debt, not necessarily any mortgage still on
            the property. Always check the case record for the full lien picture before bidding.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {goodDeals.map((deal) => (
              <ListingCard
                key={`${deal.countySlug}-${deal.caseNumber}`}
                listing={deal}
                showDate
                countyName={deal.countyName}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h1 className="text-lg font-semibold text-foreground">Search counties</h1>
        <p className="mt-1 text-sm text-muted">
          Pick up to {MAX_COUNTIES_PER_SEARCH} counties and this checks each one live, one at a
          time - not the whole state at once, which isn&rsquo;t realistic to do in a single search.
        </p>

        <form method="GET" action="/" className="mb-6 mt-4 rounded-lg border border-border bg-surface p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CountyPicker initialSelected={requestedSlugs} />
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">Zip code (optional)</label>
                <input
                  type="text"
                  name="zip"
                  defaultValue={zip ?? ""}
                  placeholder="Any zip within the selected counties"
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                />
              </div>
              <FilterFields initialFilters={filters} dateFrom={fromValid} dateTo={toValid} defaultRangeDays={DEFAULT_RANGE_DAYS} />
            </div>
          </div>
        </form>

        {overCap ? (
          <p className="rounded-lg border border-estimate bg-estimate-soft p-4 text-sm text-estimate">
            {requestedSlugs.length} counties were selected, but search is limited to{" "}
            {MAX_COUNTIES_PER_SEARCH} at a time - remove some and search again.
          </p>
        ) : error ? (
          <p className="rounded-lg border border-estimate bg-estimate-soft p-4 text-sm text-estimate">{error}</p>
        ) : !hasSearched ? (
          <p className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-muted">
            Pick at least one county above to search.
          </p>
        ) : (
          <>
            {truncated.length > 0 ? (
              <div className="mb-4 rounded-lg border border-estimate bg-estimate-soft p-3 text-xs text-estimate">
                {truncated.map((t) => (
                  <p key={t.countyName}>
                    {t.countyName} has {t.foundCount} active dates in this range - showing the nearest {t.shownCount}{" "}
                    to keep the search fast. Narrow the date range to see more of a specific window.
                  </p>
                ))}
              </div>
            ) : null}

            {listings.length === 0 ? (
              <p className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-muted">
                No listings matched across the selected counties and date range.
              </p>
            ) : (
              <>
                <p className="mb-4 text-sm text-muted">
                  {listings.length} case{listings.length === 1 ? "" : "s"} across {requestedSlugs.length}{" "}
                  count{requestedSlugs.length === 1 ? "y" : "ies"}
                </p>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {listings.map((listing) => (
                    <ListingCard
                      key={`${listing.countySlug}-${listing.auctionDate}-${listing.caseNumber}`}
                      listing={listing}
                      showDate
                      countyName={listing.countyName}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
