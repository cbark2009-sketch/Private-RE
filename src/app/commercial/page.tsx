import { getCommercialListings, type CommercialResult } from "@/lib/getCommercialListings";
import { DAYS_AHEAD } from "@/lib/refreshCounties";
import { getCurrentUserId } from "@/lib/currentUser";
import { getFavoriteKeySet, isFavorited } from "@/lib/favorites";
import { AuctionMap } from "@/components/AuctionMap";
import { ListingCard } from "@/components/ListingCard";

export const dynamic = "force-dynamic";

export default async function CommercialPage() {
  const [result, favoriteKeys] = await Promise.all([
    getCommercialListings().catch((err): CommercialResult => {
      console.error("Failed to load commercial listings:", err);
      return { listings: [], points: [], checked: 0, total: 0 };
    }),
    getCurrentUserId().then(getFavoriteKeySet),
  ]);
  const { listings, points, checked, total } = result;

  const coverage =
    checked < total
      ? ` County records have been checked for ${checked.toLocaleString()} of ${total.toLocaleString()} upcoming auctions so far - the rest are looked up automatically through the day.`
      : "";
  const caption = `Commercial and industrial properties (offices, stores, restaurants, warehouses, hotels and more) going to auction in the next ${DAYS_AHEAD} days, by the county's own land-use code.${coverage}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <h1 className="text-lg font-semibold text-foreground">Commercial properties</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Every upcoming auction across all counties whose Florida tax record lists it as commercial or
        industrial. Large apartment complexes are filed as residential by the state, so they aren&rsquo;t
        included here.
      </p>

      <div className="mt-4">
        <AuctionMap points={points} caption={caption} heightClassName="h-[420px] lg:h-[560px]" />
      </div>

      <section className="mt-8">
        {listings.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-muted">
            No commercial properties found among the auctions checked so far.
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted">
              {listings.length} commercial propert{listings.length === 1 ? "y" : "ies"}
            </p>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((listing) => (
                <ListingCard
                  key={`${listing.countySlug}-${listing.caseNumber}`}
                  listing={listing}
                  showDate
                  countyName={listing.countyName}
                  propertyType={listing.propertyType}
                  isFavorited={isFavorited(favoriteKeys, listing.countySlug, listing.caseNumber)}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
