import { getPropertyDetails, type PropertyDetails } from "@/lib/propertyDetails";
import { getFloridaParcel, type FloridaParcelRecord } from "@/lib/floridaParcel";
import { getZillowFacts, type ZillowFacts } from "@/lib/zillowFacts";
import { geocodeAddresses, type Coordinates } from "@/lib/geocode";
import { formatMoney } from "@/lib/format";

// Everything a property page knows about the building itself, pulled from
// the three sources and merged - shared by the foreclosure property page
// and the tax deed property page so both show the same facts the same way.

export interface HouseSources {
  /** Florida's tax roll - free, every county, the main source. */
  fl: FloridaParcelRecord | null;
  /** Zillow's page - the only free source of bedrooms/bathrooms. */
  zillow: ZillowFacts | null;
  /** RentCast - optional extras (roof, heating, taxes...) when its subscription is active. */
  rentcast: PropertyDetails | null;
}

/**
 * Looks the address up everywhere at once. Every source fails soft - a page
 * with some facts beats an error page. Costs at most one RentCast call and
 * one Zillow request the first time a given address is opened; after that
 * it's all cache.
 */
export async function loadHouseSources(
  address: string,
  parcelId: string | null
): Promise<{ sources: HouseSources; coords: Coordinates | null }> {
  const coords =
    (
      await geocodeAddresses([address]).catch((err) => {
        console.error(`Geocoding failed for "${address}":`, err);
        return new Map<string, Coordinates | null>();
      })
    ).get(address) ?? null;
  const [fl, zillow, rentcast] = await Promise.all([
    getFloridaParcel(address, coords, parcelId).catch((err) => {
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
  ]);
  return { sources: { fl, zillow, rentcast }, coords };
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

function count(n: number | null): string | null {
  return n != null ? String(n) : null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Every recorded sale from any source, newest first, as display strings. */
export function salesList({ fl, rentcast }: HouseSources): { when: string; sortKey: string; price: number | null }[] {
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

/** "Florida's 2026 property tax roll, Zillow (...), RentCast" - for the note under the facts. */
export function sourceNames({ fl, zillow, rentcast }: HouseSources): string[] {
  return [
    fl ? `Florida's ${fl.rollYear ? `${fl.rollYear} ` : ""}property tax roll` : null,
    zillow ? "Zillow (bedrooms, bathrooms, Zestimate)" : null,
    rentcast ? "RentCast" : null,
  ].filter((s): s is string => Boolean(s));
}

/**
 * Beds/baths/sqft/lot/year/type always show (as "Unknown" when missing) so
 * the basics are in the same place on every house; the rest only appear
 * when a source actually has them, so a sparse record doesn't turn into a
 * wall of "Unknown". Each fact prefers the county's own record, then
 * Zillow, then RentCast.
 */
export function houseFacts(sources: HouseSources): { label: string; value: string | null; always?: boolean }[] {
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
