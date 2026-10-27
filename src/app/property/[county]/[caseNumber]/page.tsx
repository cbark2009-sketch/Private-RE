import Link from "next/link";
import { notFound } from "next/navigation";
import { getListingForCase } from "@/lib/getAuctionListings";
import { getPropertyDetails, type PropertyDetails } from "@/lib/propertyDetails";
import { geocodeAddresses } from "@/lib/geocode";
import { formatMoney } from "@/lib/format";
import { formatDisplayDate } from "@/lib/dates";
import { buildZillowUrl } from "@/lib/zillow";
import { isLikelyHoaOrLienCase } from "@/lib/caseType";
import { getCurrentUserId } from "@/lib/currentUser";
import { getFavoriteKeySet, isFavorited } from "@/lib/favorites";
import { toggleFavorite } from "@/app/actions/favorites";
import { Stat } from "@/components/ListingCard";
import { PermitsSection } from "@/components/PermitsSection";
import { BackLink } from "@/components/BackLink";

export const dynamic = "force-dynamic";

type Params = Promise<{ county: string; caseNumber: string }>;

/**
 * The route param arrives still percent-encoded ("2026-CA-004234-O%20(cts%20I%2C...")
 * - verified, not assumed - so decode it back into the stored case number.
 * Case numbers never contain a literal "%", so this can't double-decode one.
 */
async function readParams(params: Params): Promise<{ countySlug: string; caseNumber: string }> {
  const { county, caseNumber } = await params;
  try {
    return { countySlug: county, caseNumber: decodeURIComponent(caseNumber) };
  } catch {
    return { countySlug: county, caseNumber };
  }
}

export async function generateMetadata({ params }: { params: Params }) {
  const { countySlug, caseNumber } = await readParams(params);
  const listing = await getListingForCase(countySlug, caseNumber, { liveEstimates: false, skipPermits: true });
  return { title: listing?.propertyAddress ? `${listing.propertyAddress} — Auction Clarity` : "Auction Clarity" };
}

/** "Nov 18, 2024" - sale dates need the year, which formatShortDate leaves out. */
function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatLot(sqft: number): string {
  const acres = sqft / 43560;
  return acres >= 0.5 ? `${acres.toFixed(2)} acres` : `${Math.round(sqft).toLocaleString()} sq ft`;
}

function yesNo(value: boolean | null, typeLabel?: string | null): string | null {
  if (value == null) return typeLabel ?? null;
  if (!value) return "No";
  return typeLabel ? `Yes (${typeLabel})` : "Yes";
}

/**
 * Beds/baths/sqft/lot/year/type always show (as "Unknown" when missing) so
 * the basics are in the same place on every house; the rest only appear
 * when the record actually has them, so a sparse record doesn't turn into
 * a wall of "Unknown".
 */
function houseFacts(d: PropertyDetails): { label: string; value: string | null; always?: boolean }[] {
  return [
    { label: "Bedrooms", value: d.bedrooms != null ? String(d.bedrooms) : null, always: true },
    { label: "Bathrooms", value: d.bathrooms != null ? String(d.bathrooms) : null, always: true },
    { label: "Living area", value: d.squareFootage != null ? `${d.squareFootage.toLocaleString()} sq ft` : null, always: true },
    { label: "Lot size", value: d.lotSize != null ? formatLot(d.lotSize) : null, always: true },
    { label: "Year built", value: d.yearBuilt != null ? String(d.yearBuilt) : null, always: true },
    { label: "Property type", value: d.propertyType, always: true },
    { label: "Stories", value: d.floorCount != null ? String(d.floorCount) : null },
    {
      label: "Garage",
      value: d.garage === false ? "None" : d.garageSpaces ? `${d.garageSpaces}-car` : d.garage ? "Yes" : null,
    },
    { label: "Pool", value: yesNo(d.pool, d.poolType) },
    { label: "Cooling", value: yesNo(d.cooling, d.coolingType) },
    { label: "Heating", value: yesNo(d.heating, d.heatingType) },
    { label: "Fireplace", value: yesNo(d.fireplace) },
    { label: "Roof", value: d.roofType },
    { label: "Exterior", value: d.exteriorType },
    { label: "HOA fee", value: d.hoaFee != null ? `${formatMoney(d.hoaFee)}/month` : null },
    {
      label: "Property taxes",
      value: d.latestTax ? `${formatMoney(d.latestTax.total)}/yr${d.latestTax.year ? ` (${d.latestTax.year})` : ""}` : null,
    },
    {
      label: "Last sold",
      value:
        d.lastSalePrice != null || d.lastSaleDate
          ? [formatMoney(d.lastSalePrice), d.lastSaleDate ? formatDate(d.lastSaleDate) : null].filter(Boolean).join(" · ")
          : null,
    },
    { label: "Owner lives there", value: d.ownerOccupied == null ? null : d.ownerOccupied ? "Yes" : "No" },
    { label: "Subdivision", value: d.subdivision },
    { label: "Zoning", value: d.zoning },
  ];
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface p-3">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-base font-semibold text-foreground">{value ?? "Unknown"}</span>
    </div>
  );
}

export default async function PropertyPage({ params }: { params: Params }) {
  const { countySlug, caseNumber } = await readParams(params);
  const listing = await getListingForCase(countySlug, caseNumber);
  if (!listing || !listing.propertyAddress) notFound();
  const address = listing.propertyAddress;

  const [details, coordsByAddress, favoriteKeys] = await Promise.all([
    getPropertyDetails(address).catch((err) => {
      console.error(`Property details failed for "${address}":`, err);
      return null;
    }),
    geocodeAddresses([address]).catch((err) => {
      console.error(`Geocoding failed for "${address}":`, err);
      return new Map();
    }),
    getCurrentUserId().then(getFavoriteKeySet),
  ]);
  const coords = coordsByAddress.get(address) ?? null;
  const favorited = isFavorited(favoriteKeys, listing.countySlug, listing.caseNumber);

  const mapQuery = encodeURIComponent(address);
  const zillowUrl = buildZillowUrl(address);
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

      {/* Where it is: the house itself up close, and the neighborhood around it. */}
      <section className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[3fr_2fr]">
        <iframe
          title={`Satellite view of ${address}`}
          src={`https://maps.google.com/maps?q=${mapQuery}&t=k&z=19&output=embed`}
          className="h-[320px] w-full rounded-lg border border-border md:h-[400px]"
        />
        <iframe
          title={`Map of the area around ${address}`}
          src={`https://maps.google.com/maps?q=${mapQuery}&t=m&z=14&output=embed`}
          className="h-[260px] w-full rounded-lg border border-border md:h-[400px]"
        />
      </section>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <a href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noopener noreferrer" className={linkClass}>
          Open in Google Maps ↗
        </a>
        {coords ? (
          <a
            href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${coords.lat},${coords.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            Street View ↗
          </a>
        ) : null}
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-foreground">About the house</h2>
        {details ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {houseFacts(details)
                .filter((f) => f.always || f.value != null)
                .map((f) => (
                  <Fact key={f.label} label={f.label} value={f.value} />
                ))}
            </div>
            <p className="mt-2 text-[11px] text-muted">
              From public property records (via RentCast). Records can be out of date or miss recent
              additions - confirm with the property appraiser before bidding.
            </p>
          </>
        ) : (
          <p className="mt-3 rounded-lg border border-border bg-surface p-4 text-sm text-muted">
            House details aren&rsquo;t available for this address right now. The property appraiser
            link below has the county&rsquo;s own record.
          </p>
        )}
      </section>

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
        </div>
      </section>

      {details?.saleHistory.length ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-foreground">Sale history</h2>
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface text-sm">
            {details.saleHistory.map((s) => (
              <li key={s.date} className="flex justify-between gap-4 px-3 py-2">
                <span className="text-muted">{formatDate(s.date)}</span>
                <span className="font-medium text-foreground tabular-nums">{formatMoney(s.price)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
