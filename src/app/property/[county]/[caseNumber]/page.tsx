import Link from "next/link";
import { notFound } from "next/navigation";
import { getListingForCase } from "@/lib/getAuctionListings";
import { getPropertyDetails, type PropertyDetails } from "@/lib/propertyDetails";
import { getFloridaParcel, type FloridaParcelRecord } from "@/lib/floridaParcel";
import { getZillowFacts, type ZillowFacts } from "@/lib/zillowFacts";
import { geocodeAddresses, type Coordinates } from "@/lib/geocode";
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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface HouseSources {
  /** Florida's tax roll - free, every county, the main source. */
  fl: FloridaParcelRecord | null;
  /** Zillow's page - the only free source of bedrooms/bathrooms. */
  zillow: ZillowFacts | null;
  /** RentCast - optional extras (roof, heating, taxes...) when its subscription is active. */
  rentcast: PropertyDetails | null;
}

function count(n: number | null): string | null {
  return n != null ? String(n) : null;
}

/** Every recorded sale from any source, newest first, as display strings. */
function salesList({ fl, rentcast }: HouseSources): { when: string; sortKey: string; price: number | null }[] {
  const sales = [
    ...(fl?.sales ?? []).map((s) => ({
      when: s.month ? `${MONTHS[s.month - 1]} ${s.year}` : String(s.year),
      sortKey: `${s.year}-${String(s.month ?? 0).padStart(2, "0")}`,
      price: s.price as number | null,
    })),
    ...(rentcast?.saleHistory ?? []).map((s) => ({ when: formatDate(s.date), sortKey: s.date.slice(0, 7), price: s.price })),
  ];
  // The same sale can come from both sources - keep one per month.
  const byMonth = new Map(sales.map((s) => [s.sortKey, s]));
  return [...byMonth.values()].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

/**
 * Beds/baths/sqft/lot/year/type always show (as "Unknown" when missing) so
 * the basics are in the same place on every house; the rest only appear
 * when a source actually has them, so a sparse record doesn't turn into a
 * wall of "Unknown". Each fact prefers the county's own record, then
 * Zillow, then RentCast.
 */
function houseFacts(sources: HouseSources): { label: string; value: string | null; always?: boolean }[] {
  const { fl, zillow: z, rentcast: rc } = sources;
  const livingArea = fl?.livingArea ?? z?.livingArea ?? rc?.squareFootage ?? null;
  const lotSize = fl?.lotSize ?? rc?.lotSize ?? null;
  const updatedYear =
    fl?.effectiveYearBuilt && fl.yearBuilt && fl.effectiveYearBuilt > fl.yearBuilt ? fl.effectiveYearBuilt : null;
  const garageSpaces = z?.garageSpaces ?? rc?.garageSpaces ?? null;
  const hoaFee = z?.hoaFee ?? rc?.hoaFee ?? null;
  const lastSale = salesList(sources)[0];

  return [
    { label: "Bedrooms", value: count(z?.bedrooms ?? rc?.bedrooms ?? null), always: true },
    { label: "Bathrooms", value: count(z?.bathrooms ?? rc?.bathrooms ?? null), always: true },
    { label: "Living area", value: livingArea != null ? `${livingArea.toLocaleString()} sq ft` : null, always: true },
    { label: "Lot size", value: lotSize != null ? formatLot(lotSize) : null, always: true },
    { label: "Year built", value: count(fl?.yearBuilt ?? z?.yearBuilt ?? rc?.yearBuilt ?? null), always: true },
    { label: "Property type", value: fl?.propertyType ?? z?.homeType ?? rc?.propertyType ?? null, always: true },
    // The appraiser's "effective" year - later than when it was built means it's been substantially updated.
    { label: "Updated around", value: count(updatedYear) },
    {
      label: "County market value",
      value: fl?.marketValue != null ? `${formatMoney(fl.marketValue)}${fl.rollYear ? ` (${fl.rollYear})` : ""}` : null,
    },
    { label: "Land value", value: fl?.landValue != null ? formatMoney(fl.landValue) : null },
    {
      label: "Extras (pool, dock, etc.)",
      value: fl?.extraFeaturesValue != null ? `${formatMoney(fl.extraFeaturesValue)} value` : null,
    },
    {
      label: "Buildings / units",
      value:
        fl && ((fl.buildings ?? 0) > 1 || (fl.residentialUnits ?? 0) > 1)
          ? `${fl.buildings ?? "?"} / ${fl.residentialUnits ?? "?"}`
          : null,
    },
    { label: "Stories", value: count(z?.stories ?? rc?.floorCount ?? null) },
    {
      label: "Garage",
      value: garageSpaces ? `${garageSpaces}-car` : rc?.garage === false ? "None" : rc?.garage ? "Yes" : null,
    },
    { label: "Pool", value: yesNo(z?.pool ?? rc?.pool ?? null, rc?.poolType) },
    { label: "Cooling", value: rc ? yesNo(rc.cooling, rc.coolingType) : null },
    { label: "Heating", value: rc ? yesNo(rc.heating, rc.heatingType) : null },
    { label: "Fireplace", value: rc ? yesNo(rc.fireplace) : null },
    { label: "Roof", value: rc?.roofType ?? null },
    { label: "Exterior", value: rc?.exteriorType ?? null },
    { label: "HOA fee", value: hoaFee != null ? `${formatMoney(hoaFee)}/month` : null },
    { label: "Zillow rent estimate", value: z?.rentZestimate != null ? `${formatMoney(z.rentZestimate)}/month` : null },
    {
      label: "Property taxes",
      value: rc?.latestTax
        ? `${formatMoney(rc.latestTax.total)}/yr${rc.latestTax.year ? ` (${rc.latestTax.year})` : ""}`
        : null,
    },
    { label: "Last sold", value: lastSale ? `${formatMoney(lastSale.price)} · ${lastSale.when}` : null },
    // A homestead exemption is only granted for the owner's primary residence - so someone very likely lives there.
    {
      label: "Owner lives there",
      value: fl ? (fl.homestead ? "Yes (homestead)" : "No homestead") : rc?.ownerOccupied == null ? null : rc.ownerOccupied ? "Yes" : "No",
    },
    { label: "Subdivision", value: rc?.subdivision ?? null },
    { label: "Zoning", value: rc?.zoning ?? null },
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

  // Every source fails soft - a house page with some facts beats an error page.
  const coords =
    (
      await geocodeAddresses([address]).catch((err) => {
        console.error(`Geocoding failed for "${address}":`, err);
        return new Map<string, Coordinates | null>();
      })
    ).get(address) ?? null;
  const [fl, zillow, rentcast, favoriteKeys] = await Promise.all([
    getFloridaParcel(address, coords, listing.parcelId).catch((err) => {
      console.error(`Florida parcel lookup failed for "${address}":`, err);
      return null;
    }),
    getZillowFacts(address).catch((err) => {
      console.error(`Zillow facts failed for "${address}":`, err);
      return null;
    }),
    getPropertyDetails(address).catch((err) => {
      console.error(`Property details failed for "${address}":`, err);
      return null;
    }),
    getCurrentUserId().then(getFavoriteKeySet),
  ]);
  const sources: HouseSources = { fl, zillow, rentcast };
  const hasHouseData = Boolean(fl || zillow || rentcast);
  const sales = salesList(sources);
  const sourceNames = [
    fl ? `Florida's ${fl.rollYear ? `${fl.rollYear} ` : ""}property tax roll` : null,
    zillow ? "Zillow (bedrooms, bathrooms, Zestimate)" : null,
    rentcast ? "RentCast" : null,
  ].filter(Boolean);
  const favorited = isFavorited(favoriteKeys, listing.countySlug, listing.caseNumber);

  const mapQuery = encodeURIComponent(address);
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
        {hasHouseData ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {houseFacts(sources)
                .filter((f) => f.always || f.value != null)
                .map((f) => (
                  <Fact key={f.label} label={f.label} value={f.value} />
                ))}
            </div>
            <p className="mt-2 text-[11px] text-muted">
              From {sourceNames.join(", ")}. Records can be out of date or miss recent additions -
              confirm with the property appraiser before bidding.
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

      {sales.length ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-foreground">Sale history</h2>
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface text-sm">
            {sales.map((s) => (
              <li key={s.sortKey} className="flex justify-between gap-4 px-3 py-2">
                <span className="text-muted">{s.when}</span>
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
