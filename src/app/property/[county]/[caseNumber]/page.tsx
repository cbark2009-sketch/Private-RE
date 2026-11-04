import Link from "next/link";
import { notFound } from "next/navigation";
import { getListingForCase } from "@/lib/getAuctionListings";
import { loadHouseSources } from "@/lib/houseSources";
import { formatMoney } from "@/lib/format";
import { formatDisplayDate } from "@/lib/dates";
import { buildZillowUrl } from "@/lib/zillow";
import { isLikelyHoaOrLienCase } from "@/lib/caseType";
import { decodeCaseParam } from "@/lib/links";
import { getCurrentUserId } from "@/lib/currentUser";
import { getFavoriteKeySet, isFavorited } from "@/lib/favorites";
import { toggleFavorite } from "@/app/actions/favorites";
import { Stat } from "@/components/ListingCard";
import { PermitsSection } from "@/components/PermitsSection";
import { BackLink } from "@/components/BackLink";
import { PropertyLocation, AboutTheHouse, SaleHistory } from "@/components/HouseDetails";

export const dynamic = "force-dynamic";

type Params = Promise<{ county: string; caseNumber: string }>;

async function readParams(params: Params): Promise<{ countySlug: string; caseNumber: string }> {
  const { county, caseNumber } = await params;
  return { countySlug: county, caseNumber: decodeCaseParam(caseNumber) };
}

export async function generateMetadata({ params }: { params: Params }) {
  const { countySlug, caseNumber } = await readParams(params);
  const listing = await getListingForCase(countySlug, caseNumber, { liveEstimates: false, skipPermits: true });
  return { title: listing?.propertyAddress ? `${listing.propertyAddress} — Auction Clarity` : "Auction Clarity" };
}

export default async function PropertyPage({ params }: { params: Params }) {
  const { countySlug, caseNumber } = await readParams(params);
  const listing = await getListingForCase(countySlug, caseNumber);
  if (!listing || !listing.propertyAddress) notFound();
  const address = listing.propertyAddress;

  const [{ sources, coords }, favoriteKeys] = await Promise.all([
    loadHouseSources(address, listing.parcelId),
    getCurrentUserId().then(getFavoriteKeySet),
  ]);
  const { zillow } = sources;
  const favorited = isFavorited(favoriteKeys, listing.countySlug, listing.caseNumber);

  const zillowUrl = zillow?.url ?? buildZillowUrl(address);
  const value = listing.valueEstimate;
  const ratio = value.amount != null && listing.finalJudgmentAmount ? value.amount / listing.finalJudgmentAmount : null;

  const linkClass = "font-medium text-accent hover:underline";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <BackLink />

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          {isLikelyHoaOrLienCase(listing.caseNumber) ? (
            <span className="mb-1 inline-block rounded-full border border-estimate bg-estimate-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-estimate">
              Likely HOA/Lien Case
            </span>
          ) : null}
          <h1 className="text-2xl font-semibold text-foreground">{address}</h1>
          <p className="mt-1 text-sm text-muted">
            {listing.countyName} County · Auction {formatDisplayDate(listing.auctionDate)} · Case #{listing.caseNumber}
          </p>
        </div>
        <form action={toggleFavorite}>
          <input type="hidden" name="countySlug" value={listing.countySlug} />
          <input type="hidden" name="caseNumber" value={listing.caseNumber} />
          <button
            type="submit"
            aria-pressed={favorited}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              favorited ? "bg-accent text-navy" : "border border-border text-muted hover:bg-surface"
            }`}
          >
            {favorited ? "★ Favorited" : "☆ Add to favorites"}
          </button>
        </form>
      </header>

      <PropertyLocation address={address} coords={coords} />
      <AboutTheHouse sources={sources} />

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-foreground">Auction numbers</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Final Judgment" value={formatMoney(listing.finalJudgmentAmount)} badge="fact" />
          <Stat
            label="Est. Plaintiff Max Bid"
            value={formatMoney(listing.estimatedMaxBid)}
            badge="estimate"
            note="Real max bid is hidden until the auction. This assumes the lender bids up to the judgment amount, the common real-world pattern."
          />
          <Stat
            label={value.basis === "market-comps" ? "Market Value Estimate" : "Rough Value Estimate"}
            value={formatMoney(value.amount)}
            badge="estimate"
            note={value.note}
          />
          <Stat label="Assessed (Tax) Value" value={formatMoney(listing.assessedValue)} badge="fact" />
          {zillow?.zestimate != null ? (
            <Stat
              label="Zillow Zestimate"
              value={formatMoney(zillow.zestimate)}
              badge="estimate"
              note="Zillow's own automated estimate, read from its page for this house - a second opinion next to the estimate above."
            />
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {value.rangeLow != null && value.rangeHigh != null ? (
            <span>
              Value range: {formatMoney(value.rangeLow)}–{formatMoney(value.rangeHigh)}
            </span>
          ) : null}
          {value.compAvgPricePerSqft != null && value.compCount ? (
            <span>
              {formatMoney(value.compAvgPricePerSqft)}/sq ft average across {value.compCount} nearby comps
            </span>
          ) : null}
          {ratio != null ? <span>Value estimate is {ratio.toFixed(2)}× the judgment</span> : null}
          {zillow?.zestimate != null && listing.finalJudgmentAmount ? (
            <span>Zestimate is {(zillow.zestimate / listing.finalJudgmentAmount).toFixed(2)}× the judgment</span>
          ) : null}
        </div>
      </section>

      <SaleHistory sources={sources} />

      {listing.permits ? (
        <section className="mt-8">
          <PermitsSection permits={listing.permits} />
        </section>
      ) : null}

      <section className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-4 text-sm">
        {listing.caseDetailUrl ? (
          <a href={listing.caseDetailUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
            View case record ↗
          </a>
        ) : null}
        {listing.parcelUrl ? (
          <a href={listing.parcelUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
            View property appraiser ↗
          </a>
        ) : null}
        {zillowUrl ? (
          <a href={zillowUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
            Compare on Zillow ↗
          </a>
        ) : null}
        <Link href={`/auctions/${listing.countySlug}/${listing.auctionDate}`} className={linkClass}>
          See every auction that day →
        </Link>
      </section>
    </div>
  );
}
