import Link from "next/link";
import { getUpcomingTaxDeeds, taxDeedsToMapPoints, type TaxDeedView } from "@/lib/taxDeeds";
import { TAX_DEED_COUNTIES, getTaxDeedCounty } from "@/lib/taxDeedCounties";
import { getRefreshCoverage, DAYS_AHEAD } from "@/lib/refreshCounties";
import { AuctionMap } from "@/components/AuctionMap";
import { TaxDeedCard, TaxDeedCaveat } from "@/components/TaxDeedCard";
import { DOT_COLORS } from "@/lib/mapDots";

export const dynamic = "force-dynamic";

// Every card has a lazy-loaded satellite map, so cap how many render at once -
// the map above still shows every sale that matches.
const MAX_CARDS = 300;

type PropertyKind = "all" | "buildings" | "land";

interface TaxDeedSearch {
  county?: string;
  zip?: string;
  maxBid?: string;
  kind?: string;
}

/**
 * Unlike the foreclosure search, filtering here never scrapes anything: the
 * scheduled tax deed refresh already keeps every county's sales stored, so
 * a search is just narrowing that list - instant, and safe to change freely.
 */
function applyFilters(sales: TaxDeedView[], county: string | undefined, zip: string | undefined, maxBid: number | undefined, kind: PropertyKind) {
  return sales.filter((s) => {
    if (county && s.countySlug !== county) return false;
    if (zip && s.zipCode !== zip) return false;
    if (maxBid != null && (s.openingBid == null || s.openingBid > maxBid)) return false;
    // "Unknown" (tax record not looked up yet, or not matched) stays in both
    // narrower views rather than vanishing from both.
    if (kind === "land" && !s.vacantLand) return false;
    if (kind === "buildings" && s.vacantLand) return false;
    return true;
  });
}

export default async function TaxDeedsPage({ searchParams }: { searchParams: Promise<TaxDeedSearch> }) {
  const params = await searchParams;
  const county = params.county && getTaxDeedCounty(params.county) ? params.county : undefined;
  const zip = params.zip && /^\d{5}$/.test(params.zip) ? params.zip : undefined;
  const maxBidNum = Number(params.maxBid);
  const maxBid = params.maxBid && Number.isFinite(maxBidNum) && maxBidNum > 0 ? maxBidNum : undefined;
  const kind: PropertyKind = params.kind === "buildings" || params.kind === "land" ? params.kind : "all";
  const filtered = Boolean(county || zip || maxBid != null || kind !== "all");

  const [all, coverage] = await Promise.all([
    getUpcomingTaxDeeds().catch((err) => {
      console.error("Failed to load tax deeds:", err);
      return [] as TaxDeedView[];
    }),
    getRefreshCoverage("taxDeeds").catch(() => null),
  ]);
  const sales = applyFilters(all, county, zip, maxBid, kind);
  const points = await taxDeedsToMapPoints(sales).catch((err) => {
    console.error("Failed to load tax deed map points:", err);
    return [];
  });

  const coverageText =
    coverage && coverage.fresh > 0
      ? `across ${coverage.fresh === coverage.total ? "all" : `${coverage.fresh} of`} ${coverage.total} counties that sell tax deeds online`
      : "across the counties loaded so far";
  const caption = filtered
    ? `Showing the tax deed sales that match your filters.`
    : `Tax deed sales over the next ${DAYS_AHEAD} days ${coverageText}, refreshed automatically through the day.`;
  const mapKey = `${county}|${zip}|${maxBid}|${kind}`;
  const inputClass = "mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section>
          <h1 className="text-lg font-semibold text-foreground">Tax deed sales</h1>
          <p className="mt-1 text-sm text-muted">
            Properties being sold for unpaid property taxes, from each county&rsquo;s online tax deed
            auction site.
          </p>
          <div className="mt-3">
            <TaxDeedCaveat />
          </div>

          <form method="GET" action="/tax-deeds" className="mt-4 flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
            <div>
              <label className="text-xs font-medium text-foreground">County</label>
              <select name="county" defaultValue={county ?? ""} className={inputClass}>
                <option value="">All counties</option>
                {TAX_DEED_COUNTIES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Zip code (optional)</label>
              <input type="text" name="zip" defaultValue={zip ?? ""} placeholder="Any zip" className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Max opening bid (optional)</label>
              <input
                type="number"
                name="maxBid"
                min={0}
                step={1000}
                defaultValue={maxBid ?? ""}
                placeholder="e.g. 25000"
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Property</label>
              <select name="kind" defaultValue={kind} className={inputClass}>
                <option value="all">Everything</option>
                <option value="buildings">Homes and buildings</option>
                <option value="land">Vacant land only</option>
              </select>
              <p className="mt-0.5 text-[11px] text-muted">Based on the county&rsquo;s land-use code, where it&rsquo;s been looked up.</p>
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-navy hover:opacity-90"
            >
              Search
            </button>
            {filtered ? (
              <Link href="/tax-deeds" className="text-center text-xs text-muted hover:underline">
                Clear filters
              </Link>
            ) : null}
          </form>
        </section>

        <section className="lg:sticky lg:top-4 lg:self-start">
          <AuctionMap
            key={mapKey}
            points={points}
            caption={caption}
            legend={[{ color: DOT_COLORS.foreclosure, label: "Tax deed sale" }]}
          />
        </section>
      </div>

      <section className="mt-8">
        {sales.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-muted">
            {filtered ? "No tax deed sales match these filters." : "No tax deed sales loaded yet - the scheduled refresh fills these in."}
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted">
              {sales.length.toLocaleString()} tax deed sale{sales.length === 1 ? "" : "s"}
              {sales.length > MAX_CARDS ? ` - showing the soonest ${MAX_CARDS}; narrow the filters to see the rest` : ""}
            </p>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {sales.slice(0, MAX_CARDS).map((sale) => (
                <TaxDeedCard key={`${sale.countySlug}-${sale.caseNumber}-${sale.auctionDate}`} sale={sale} />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
