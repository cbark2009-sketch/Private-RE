import type { County } from "@/lib/counties";

// Florida counties that run their tax deed sales on RealTaxDeed - the sister
// platform to RealForeclose (same vendor, same software, same scraper; see
// scrapeTaxDeedDate in scrapeAuctions.ts). Found 2026-11-03 by requesting
// <county>.realtaxdeed.com's calendar for all 67 counties one at a time:
// these 39 serve a working calendar, 29 of them with sales scheduled that
// month; the rest redirect to realauction.com (they sell elsewhere).
//
// Deliberately its own list, not a flag on COUNTIES: the two don't line up
// (Lake, Osceola, Hernando, Highlands, Monroe, Hendry and Suwannee sell tax
// deeds here but not foreclosures; Charlotte, Manatee, St. Johns and others
// the reverse), and a few hosts are spelled differently. Slugs match
// COUNTIES' wherever a county is in both.
export const TAX_DEED_COUNTIES: County[] = [
  { name: "Alachua", slug: "alachua", host: "alachua.realtaxdeed.com" },
  { name: "Baker", slug: "baker", host: "baker.realtaxdeed.com" },
  { name: "Bay", slug: "bay", host: "bay.realtaxdeed.com" },
  { name: "Broward", slug: "broward", host: "broward.realtaxdeed.com" },
  { name: "Citrus", slug: "citrus", host: "citrus.realtaxdeed.com" },
  { name: "Clay", slug: "clay", host: "clay.realtaxdeed.com" },
  { name: "Duval", slug: "duval", host: "duval.realtaxdeed.com" },
  { name: "Escambia", slug: "escambia", host: "escambia.realtaxdeed.com" },
  { name: "Flagler", slug: "flagler", host: "flagler.realtaxdeed.com" },
  { name: "Gilchrist", slug: "gilchrist", host: "gilchrist.realtaxdeed.com" },
  { name: "Gulf", slug: "gulf", host: "gulf.realtaxdeed.com" },
  { name: "Hendry", slug: "hendry", host: "hendry.realtaxdeed.com" },
  { name: "Hernando", slug: "hernando", host: "hernando.realtaxdeed.com" },
  { name: "Highlands", slug: "highlands", host: "highlands.realtaxdeed.com" },
  { name: "Hillsborough", slug: "hillsborough", host: "hillsborough.realtaxdeed.com" },
  { name: "Indian River", slug: "indian-river", host: "indianriver.realtaxdeed.com" },
  { name: "Jackson", slug: "jackson", host: "jackson.realtaxdeed.com" },
  { name: "Lake", slug: "lake", host: "lake.realtaxdeed.com" },
  { name: "Lee", slug: "lee", host: "lee.realtaxdeed.com" },
  { name: "Leon", slug: "leon", host: "leon.realtaxdeed.com" },
  { name: "Marion", slug: "marion", host: "marion.realtaxdeed.com" },
  { name: "Martin", slug: "martin", host: "martin.realtaxdeed.com" },
  { name: "Miami-Dade", slug: "miami-dade", host: "miamidade.realtaxdeed.com" },
  { name: "Monroe", slug: "monroe", host: "monroe.realtaxdeed.com" },
  { name: "Nassau", slug: "nassau", host: "nassau.realtaxdeed.com" },
  { name: "Okeechobee", slug: "okeechobee", host: "okeechobee.realtaxdeed.com" },
  { name: "Orange", slug: "orange", host: "orange.realtaxdeed.com" },
  { name: "Osceola", slug: "osceola", host: "osceola.realtaxdeed.com" },
  { name: "Palm Beach", slug: "palm-beach", host: "palmbeach.realtaxdeed.com" },
  { name: "Pasco", slug: "pasco", host: "pasco.realtaxdeed.com" },
  { name: "Pinellas", slug: "pinellas", host: "pinellas.realtaxdeed.com" },
  { name: "Polk", slug: "polk", host: "polk.realtaxdeed.com" },
  { name: "Putnam", slug: "putnam", host: "putnam.realtaxdeed.com" },
  { name: "Santa Rosa", slug: "santa-rosa", host: "santarosa.realtaxdeed.com" },
  { name: "Sarasota", slug: "sarasota", host: "sarasota.realtaxdeed.com" },
  { name: "Seminole", slug: "seminole", host: "seminole.realtaxdeed.com" },
  { name: "Suwannee", slug: "suwannee", host: "suwannee.realtaxdeed.com" },
  { name: "Volusia", slug: "volusia", host: "volusia.realtaxdeed.com" },
  { name: "Washington", slug: "washington", host: "washington.realtaxdeed.com" },
];

const BY_SLUG = new Map(TAX_DEED_COUNTIES.map((c) => [c.slug, c]));

export function getTaxDeedCounty(slug: string): County | undefined {
  return BY_SLUG.get(slug);
}

/**
 * Key for this county's tax deed rows in tables shared with the foreclosure
 * side (CalendarCache, CountyRefresh), which are keyed by county slug -
 * without the prefix, Orange's tax deed calendar would overwrite Orange's
 * foreclosure calendar.
 */
export function taxDeedKey(slug: string): string {
  return `taxdeed:${slug}`;
}
