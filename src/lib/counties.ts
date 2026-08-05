// Florida counties whose foreclosure auction calendar is confirmed live on
// the RealForeclose platform, verified 2026-08-03 by resolving each one
// through the platform's own site-switch endpoint (POST /index.cfm,
// func=SWITCH) from myorangeclerk.realforeclose.com, then confirming each
// resulting host actually serves a working auction calendar page.
//
// This is NOT all 67 Florida counties - the rest aren't part of this
// platform's network at all (Orange's own site doesn't know they exist),
// which means they're most likely on a different vendor entirely. Adding
// one of those would mean identifying and integrating its specific
// platform, not just adding a row here.
export interface County {
  name: string;
  slug: string;
  host: string;
}

export const COUNTIES: County[] = [
  { name: "Alachua", slug: "alachua", host: "alachua.realforeclose.com" },
  { name: "Baker", slug: "baker", host: "baker.realforeclose.com" },
  { name: "Bay", slug: "bay", host: "bay.realforeclose.com" },
  { name: "Broward", slug: "broward", host: "broward.realforeclose.com" },
  { name: "Calhoun", slug: "calhoun", host: "calhoun.realforeclose.com" },
  { name: "Charlotte", slug: "charlotte", host: "charlotte.realforeclose.com" },
  { name: "Citrus", slug: "citrus", host: "citrus.realforeclose.com" },
  { name: "Clay", slug: "clay", host: "clay.realforeclose.com" },
  { name: "Duval", slug: "duval", host: "duval.realforeclose.com" },
  { name: "Escambia", slug: "escambia", host: "escambia.realforeclose.com" },
  { name: "Flagler", slug: "flagler", host: "flagler.realforeclose.com" },
  { name: "Gilchrist", slug: "gilchrist", host: "gilchrist.realforeclose.com" },
  { name: "Gulf", slug: "gulf", host: "gulf.realforeclose.com" },
  { name: "Hillsborough", slug: "hillsborough", host: "hillsborough.realforeclose.com" },
  { name: "Indian River", slug: "indian-river", host: "indian-river.realforeclose.com" },
  { name: "Jackson", slug: "jackson", host: "jackson.realforeclose.com" },
  { name: "Lee", slug: "lee", host: "lee.realforeclose.com" },
  { name: "Leon", slug: "leon", host: "leon.realforeclose.com" },
  { name: "Manatee", slug: "manatee", host: "manatee.realforeclose.com" },
  { name: "Marion", slug: "marion", host: "marion.realforeclose.com" },
  { name: "Martin", slug: "martin", host: "martin.realforeclose.com" },
  { name: "Miami-Dade", slug: "miami-dade", host: "miamidade.realforeclose.com" },
  { name: "Nassau", slug: "nassau", host: "nassauclerk.realforeclose.com" },
  { name: "Okeechobee", slug: "okeechobee", host: "okeechobee.realforeclose.com" },
  { name: "Orange", slug: "orange", host: "myorangeclerk.realforeclose.com" },
  { name: "Palm Beach", slug: "palm-beach", host: "palmbeach.realforeclose.com" },
  { name: "Pasco", slug: "pasco", host: "pasco.realforeclose.com" },
  { name: "Pinellas", slug: "pinellas", host: "pinellas.realforeclose.com" },
  { name: "Polk", slug: "polk", host: "polk.realforeclose.com" },
  { name: "Putnam", slug: "putnam", host: "putnam.realforeclose.com" },
  { name: "Saint Johns", slug: "saint-johns", host: "saintjohns.realforeclose.com" },
  { name: "Santa Rosa", slug: "santa-rosa", host: "santarosa.realforeclose.com" },
  { name: "Sarasota", slug: "sarasota", host: "sarasota.realforeclose.com" },
  { name: "Seminole", slug: "seminole", host: "seminole.realforeclose.com" },
  { name: "St. Lucie", slug: "saint-lucie", host: "stlucie.realforeclose.com" },
  { name: "Volusia", slug: "volusia", host: "volusia.realforeclose.com" },
  { name: "Walton", slug: "walton", host: "walton.realforeclose.com" },
  { name: "Washington", slug: "washington", host: "washington.realforeclose.com" },
];

const BY_SLUG = new Map(COUNTIES.map((c) => [c.slug, c]));

export function getCounty(slug: string): County | undefined {
  return BY_SLUG.get(slug);
}

export function countyNameToSlug(name: string): string {
  return name
    .toLowerCase()
    // Source data is inconsistent about "St." vs "Saint" (RealForeclose's own
    // dropdown uses "St. Lucie" but "Saint Johns"; the zip dataset spells both
    // out as "Saint"), so normalize the abbreviated form before slugifying.
    .replace(/^st\.?\s/, "saint ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
