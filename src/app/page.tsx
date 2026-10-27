import { getListingsAcrossCounties, DEFAULT_RANGE_DAYS } from "@/lib/getMultiDateListings";
import { getUpcomingMapPoints, listingsToMapPoints, type MapPoint } from "@/lib/getMapPoints";
import { getCounty } from "@/lib/counties";
import { isValidISODate } from "@/lib/dates";
import { parseListingFilters, buildFilterQueryString, type FilterSearchParams } from "@/lib/filterParams";
import { ListingCard } from "@/components/ListingCard";
import { CountyPicker, CountySearchButton, MAX_COUNTIES_PER_SEARCH } from "@/components/CountyPicker";
import { FilterFields } from "@/components/FilterFields";
import { AuctionMap } from "@/components/AuctionMap";
import { getCurrentUserId } from "@/lib/currentUser";
import { getFavoriteKeySet, isFavorited } from "@/lib/favorites";

// Without this, Next.js prerenders the page once at build time and serves
// that same static HTML to everyone - both the map and any search results
// would freeze at whatever was true the moment of the last deploy. Same
// pattern as every other data-driven page in the app.
export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ counties?: string | string[]; zip?: string; dateFrom?: string; dateTo?: string } & FilterSearchParams>;
}) {
  const resolved = await searchParams;
  const { zip, dateFrom, dateTo } = resolved;
  const favoriteKeys = await getFavoriteKeySet(await getCurrentUserId());

  const requestedSlugs = (Array.isArray(resolved.counties) ? resolved.counties : resolved.counties ? [resolved.counties] : [])
    .filter((slug, i, arr) => arr.indexOf(slug) === i) // dedupe
    .filter((slug) => getCounty(slug));

  const zipFilter = zip && /^\d{5}$/.test(zip) ? zip : undefined;
  const filters = parseListingFilters(resolved);
  const hasSearched = requestedSlugs.length > 0;
  const overCap = requestedSlugs.length > MAX_COUNTIES_PER_SEARCH;

  const fromValid = dateFrom && isValidISODate(dateFrom) ? dateFrom : undefined;
  const toValid = dateTo && isValidISODate(dateTo) ? dateTo : undefined;

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

  // Before a search, the map shows every upcoming auction already saved;
  // after one, exactly the results listed below it.
  const showingResults = hasSearched && !overCap && !error;
  const mapPoints: MapPoint[] = await (showingResults ? listingsToMapPoints(listings) : getUpcomingMapPoints()).catch(
    (err) => {
      console.error("Failed to load map points:", err);
      return [];
    }
  );
  const mapCaption = showingResults
    ? `Showing the ${listings.length === 1 ? "result" : "results"} of your search.`
    : "Every upcoming auction this site has loaded so far - a county fills in once it's been searched or browsed.";
  const mapKey = showingResults
    ? buildFilterQueryString({ zip: zipFilter, filters, counties: requestedSlugs }) + `|${fromValid}|${toValid}`
    : "upcoming";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section>
          <h1 className="text-lg font-semibold text-foreground">Search counties</h1>
          <p className="mt-1 text-sm text-muted">
            Pick up to {MAX_COUNTIES_PER_SEARCH}{" "}counties and this checks each one live, one at a
            time - not the whole state at once, which isn&rsquo;t realistic to do in a single search.
          </p>

          <form method="GET" action="/" className="mt-4 flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
            <CountyPicker initialSelected={requestedSlugs} />
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
            <CountySearchButton initialCount={requestedSlugs.length} />
          </form>
        </section>

        <section className="lg:sticky lg:top-4 lg:self-start">
          <AuctionMap key={mapKey} points={mapPoints} caption={mapCaption} />
        </section>
      </div>

      {overCap ? (
        <p className="mt-6 rounded-lg border border-estimate bg-estimate-soft p-4 text-sm text-estimate">
          {requestedSlugs.length} counties were selected, but search is limited to{" "}
          {MAX_COUNTIES_PER_SEARCH} at a time - remove some and search again.
        </p>
      ) : error ? (
        <p className="mt-6 rounded-lg border border-estimate bg-estimate-soft p-4 text-sm text-estimate">{error}</p>
      ) : hasSearched ? (
        <section className="mt-8">
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
                    isFavorited={isFavorited(favoriteKeys, listing.countySlug, listing.caseNumber)}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
