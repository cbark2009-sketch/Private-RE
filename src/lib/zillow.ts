/**
 * Builds a link to Zillow's own page for an address, so a user can compare
 * Zillow's estimate against this app's own. Verified this URL shape against
 * a real address before using it - it redirects to the house's /homedetails/
 * page. Also the page zillowFacts.ts reads beds/baths from, which goes
 * against Zillow's terms of service: the owner decided on 2026-11-02 to
 * accept that risk since this site is for his own use (RentCast, the
 * licensed source chosen originally, stopped working for free).
 */
export function buildZillowUrl(propertyAddress: string): string | null {
  // Stored format is "STREET, CITY, ZIP" or "STREET, CITY, FL- ZIP"
  // depending on county - split on comma rather than assuming a fixed
  // pattern, and always append "FL" ourselves since this app is FL-only
  // and not every county's source text spells it out.
  const parts = propertyAddress.split(",").map((p) => p.trim());
  if (parts.length < 3) return null;

  const [street, city] = parts;
  const zip = parts[2].match(/\d{5}/)?.[0];
  if (!street || !city || !zip) return null;

  const slug = `${street} ${city} FL ${zip}`
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

  return `https://www.zillow.com/homes/${slug}_rb/`;
}
