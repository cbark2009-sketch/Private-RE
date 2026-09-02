"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";

/**
 * A standalone server-action module (not defined inline on a page) so
 * ListingCard - rendered from several different pages - can import and wire
 * it up directly instead of every page having to thread it down as a prop.
 */
export async function toggleFavorite(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) return;

  const countySlug = String(formData.get("countySlug"));
  const caseNumber = String(formData.get("caseNumber"));

  const existing = await prisma.favorite.findUnique({
    where: { userId_countySlug_caseNumber: { userId, countySlug, caseNumber } },
  });

  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } });
  } else {
    await prisma.favorite.create({ data: { userId, countySlug, caseNumber } });
  }

  // Listings render on several different routes (single-county, multi-date,
  // cross-county search, the favorites page itself) - revalidate broadly
  // rather than trying to enumerate every path that might show this card.
  revalidatePath("/", "layout");
}
