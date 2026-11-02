import { getCounty } from "@/lib/counties";
import { toISODate } from "@/lib/dates";
import { getUpcomingRows, listingsToMapPoints, type MapPoint } from "@/lib/getMapPoints";
import { getCachedParcelRecords, isCommercialRecord } from "@/lib/floridaParcel";
import { buildListingView, type AuctionListingView } from "@/lib/getAuctionListings";

export interface CommercialListing extends AuctionListingView {
  /** The county's land-use label, e.g. "Office building (one story)". */
  propertyType: string | null;
}

export interface CommercialResult {
  listings: CommercialListing[];
  points: MapPoint[];
  /** How many upcoming auctions have had their county record looked up yet, out of `total` - the rest can't be classified yet. */
  checked: number;
  total: number;
}

/**
 * Every upcoming auction whose Florida tax-roll record says commercial or
 * industrial (see isCommercialRecord), for the Commercial page. Reads only
 * cached records - the scheduled statewide refresh (refreshCounties.ts) is
 * what looks every auction up, so an auction it hasn't reached yet simply
 * isn't classified yet, and `checked`/`total` says how far along that is.
 * Like the map, never spends RentCast quota or scrapes anything.
 */
export async function getCommercialListings(): Promise<CommercialResult> {
  const rows = await getUpcomingRows();
  const { records, checked } = await getCachedParcelRecords(rows.map((r) => r.propertyAddress!));

  const commercialRows = rows.filter((row) => {
    const record = records.get(row.propertyAddress!);
    return record != null && isCommercialRecord(record);
  });

  const listings = await Promise.all(
    commercialRows.map(async (row): Promise<CommercialListing> => {
      const view = await buildListingView(row, getCounty(row.countySlug)!, toISODate(row.auctionDate), {
        liveEstimates: false,
        skipPermits: true,
      });
      return { ...view, propertyType: records.get(row.propertyAddress!)?.propertyType ?? null };
    })
  );

  const typeByAddress = new Map(listings.map((l) => [l.propertyAddress, l.propertyType]));
  const points = (await listingsToMapPoints(listings)).map((p) => ({ ...p, propertyType: typeByAddress.get(p.address) ?? null }));

  return {
    listings,
    points,
    checked: rows.filter((r) => checked.has(r.propertyAddress!)).length,
    total: rows.length,
  };
}
