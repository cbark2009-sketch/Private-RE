import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { geocodeAddresses, MAX_ADDRESSES_PER_REQUEST } from "@/lib/geocode";

// One Census batch request is usually a couple of seconds, but give it room
// on a slow day rather than cutting off a request that's nearly done.
export const maxDuration = 60;

/**
 * Called by the homepage map (src/components/AuctionMap.tsx) for whichever
 * of its dots aren't geocoded yet, so the page itself never waits on Census.
 * Only geocodes addresses that are actually listings in our database - this
 * isn't a general-purpose geocoder for anything a client sends.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { addresses?: unknown } | null;
  const requested = Array.isArray(body?.addresses)
    ? body.addresses.filter((a): a is string => typeof a === "string" && a.length > 0 && a.length <= 300)
    : [];
  if (requested.length === 0 || requested.length > MAX_ADDRESSES_PER_REQUEST) {
    return NextResponse.json({ error: `Send 1-${MAX_ADDRESSES_PER_REQUEST} addresses.` }, { status: 400 });
  }

  const known = await prisma.listing.findMany({
    where: { propertyAddress: { in: requested } },
    select: { propertyAddress: true },
    distinct: ["propertyAddress"],
  });
  const addresses = known.map((k) => k.propertyAddress!);
  if (addresses.length === 0) return NextResponse.json({ results: {} });

  try {
    const results = await geocodeAddresses(addresses);
    return NextResponse.json({ results: Object.fromEntries(results) });
  } catch (err) {
    console.error("Geocoding failed:", err);
    return NextResponse.json({ error: "Geocoding failed" }, { status: 502 });
  }
}
