import { prisma } from "@/lib/db";
import { fetchOrlandoPermits, fetchFortLauderdalePermits, fetchMiamiDadePermits } from "./sources";
import type { Permit } from "./types";

export type { Permit } from "./types";

interface PermitSource {
  fetch: (parcelId: string) => Promise<Permit[]>;
  sourceLabel: string;
  sourceUrl: string;
}

// Only counties with a confirmed, live, non-CAPTCHA permit data source get
// an entry here - surveyed the biggest FL population centers (2026-08-05)
// and these three were the only ones that panned out. Orange/Broward are
// really "Orlando" and "Fort Lauderdale" specifically (city-run systems),
// not the whole county - see the caveats in sources.ts. Everything else
// (Tampa: stats-only dataset with no address field; Orange's own FastTrack:
// CAPTCHA-gated; Jacksonville/St. Petersburg: no open API found; the
// remaining ~33 counties: not checked) has no entry, which is the intended
// signal for "not covered" - see getPermitsForListing below.
const PERMIT_SOURCES: Record<string, PermitSource> = {
  orange: {
    fetch: fetchOrlandoPermits,
    sourceLabel: "City of Orlando",
    sourceUrl: "https://data.cityoforlando.net/Permitting/Permit-Applications/ryhf-m453",
  },
  broward: {
    fetch: fetchFortLauderdalePermits,
    sourceLabel: "City of Fort Lauderdale",
    sourceUrl: "https://gis.fortlauderdale.gov/buildingpermittracker/",
  },
  "miami-dade": {
    fetch: fetchMiamiDadePermits,
    sourceLabel: "Miami-Dade County",
    sourceUrl: "https://www.miamidade.gov/permits/",
  },
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface PermitResult {
  permits: Permit[];
  sourceLabel: string;
  sourceUrl: string;
}

/**
 * Looks up building permit history for a listing's parcel, if its county
 * has a known public permit data source. Returns `null` - not `[]` - when
 * the county isn't covered at all, or there's no parcel ID to look up, so
 * the UI can omit the section entirely rather than implying a real "checked,
 * found nothing" result. A supported county with a genuinely permit-less
 * parcel (or one outside the covered city, for Orange/Broward) correctly
 * returns `{ permits: [] }`.
 */
export async function getPermitsForListing(countySlug: string, parcelId: string | null): Promise<PermitResult | null> {
  const source = PERMIT_SOURCES[countySlug];
  if (!source || !parcelId) return null;

  const cached = await prisma.permitCache.findUnique({
    where: { countySlug_parcelId: { countySlug, parcelId } },
  });
  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    return { permits: JSON.parse(cached.data) as Permit[], sourceLabel: source.sourceLabel, sourceUrl: source.sourceUrl };
  }

  const permits = await source.fetch(parcelId);
  await prisma.permitCache.upsert({
    where: { countySlug_parcelId: { countySlug, parcelId } },
    create: { countySlug, parcelId, data: JSON.stringify(permits) },
    update: { data: JSON.stringify(permits), fetchedAt: new Date() },
  });
  return { permits, sourceLabel: source.sourceLabel, sourceUrl: source.sourceUrl };
}
