import zipData from "@/data/fl-zip-county.json";
import { COUNTIES, countyNameToSlug, getCounty, type County } from "@/lib/counties";

interface ZipRecord {
  zip: string;
  county: string;
}

const ZIP_TO_COUNTY_SLUG = new Map<string, string>(
  (zipData as ZipRecord[]).map((r) => [r.zip, countyNameToSlug(r.county)])
);

export type ZipLookupResult =
  | { status: "found"; county: County }
  | { status: "unsupported-county"; countyName: string }
  | { status: "unknown-zip" };

/** Resolves a 5-digit FL zip to one of our supported counties, or explains why not. */
export function lookupZip(zip: string): ZipLookupResult {
  const slug = ZIP_TO_COUNTY_SLUG.get(zip);
  if (!slug) return { status: "unknown-zip" };

  const county = getCounty(slug);
  if (county) return { status: "found", county };

  // We know the county, just don't have it in our supported list yet.
  const original = (zipData as ZipRecord[]).find((r) => r.zip === zip)?.county ?? slug;
  return { status: "unsupported-county", countyName: original };
}

export function isSupportedCountySlug(slug: string): boolean {
  return COUNTIES.some((c) => c.slug === slug);
}
