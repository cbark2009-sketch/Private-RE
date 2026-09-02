import { getCurrentUserId } from "@/lib/currentUser";
import { getFavoritedListings } from "@/lib/favorites";
import { ListingCard } from "@/components/ListingCard";

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const userId = await getCurrentUserId();
  const listings = userId ? await getFavoritedListings(userId) : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <h1 className="text-lg font-semibold text-foreground">Your favorites</h1>
      <p className="mt-1 text-sm text-muted">
        Listings you&rsquo;ve starred, so you don&rsquo;t have to search for them again.
      </p>

      {listings.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface p-6 text-center text-sm text-muted">
          Nothing favorited yet - click the star on any listing to save it here.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <ListingCard
              key={`${listing.countySlug}-${listing.caseNumber}`}
              listing={listing}
              showDate
              countyName={listing.countyName}
              isFavorited
            />
          ))}
        </div>
      )}
    </div>
  );
}
