/**
 * Builds a link to Zillow's own page for an address, so a user can compare
 * Zillow's estimate against this app's own. This is just a link out - never
 * scrapes Zillow's data (their ToS actively prohibits and enforces against
 * that, unlike the public court-record data this app is built on - see
 * project history for why RentCast was chosen over scraping Zillow/Redfin).
 * Verified this URL shape against a real address before using it.
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
