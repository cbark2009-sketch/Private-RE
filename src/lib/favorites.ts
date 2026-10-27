import { prisma } from "@/lib/db";
import { getListingForCase, type AuctionListingView } from "@/lib/getAuctionListings";

function key(countySlug: string, caseNumber: string): string {
  return `${countySlug}:${caseNumber}`;
}

/** Every listing the user has favorited, as a Set of "countySlug:caseNumber" keys for a cheap membership check per card when rendering a grid - one query per page instead of one per listing. */
export async function getFavoriteKeySet(userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set();
  const rows = await prisma.favorite.findMany({ where: { userId }, select: { countySlug: true, caseNumber: true } });
  return new Set(rows.map((r) => key(r.countySlug, r.caseNumber)));
}

export function isFavorited(favoriteKeys: Set<string>, countySlug: string, caseNumber: string): boolean {
  return favoriteKeys.has(key(countySlug, caseNumber));
}

/**
 * Resolves every favorited case to view-ready listing data for the
 * favorites page. Looks up each case by (countySlug, caseNumber) and takes
 * its most recent Listing row rather than a specific stored row id - a
 * postponed auction gets a new row on the new date under the same case
 * number (see Listing's and Favorite's schema comments), and a favorite
 * should keep following the case through that, not freeze on a stale date.
 *
 * Never spends live RentCast quota here (same discipline as cross-county
 * search) - a favorites list exists specifically to be revisited often, so
 * pulling from cache only is what keeps that free. Permits stay live since
 * they're free/unquota'd government APIs and a favorites list is small.
 */
export async function getFavoritedListings(userId: string): Promise<AuctionListingView[]> {
  const favorites = await prisma.favorite.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });

  const views: AuctionListingView[] = [];
  for (const fav of favorites) {
    // Null shouldn't happen (rows are never deleted) unless a county was
    // removed from counties.ts after being favorited.
    const view = await getListingForCase(fav.countySlug, fav.caseNumber, { liveEstimates: false });
    if (view) views.push(view);
  }
  return views;
}
