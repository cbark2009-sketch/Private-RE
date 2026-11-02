const DIRECTIONS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]);

export interface StreetParts {
  number: string;
  /** First word of the street name, after any N/S/E/W prefix - "ROCKY" for "499 ROCKY BROOK CT". Suffixes (CT/COURT, AVE/AVENUE) are left out on purpose since sources abbreviate them differently. */
  name: string;
  unit: string | null;
}

/** "499 ROCKY BROOK CT" -> { number: "499", name: "ROCKY", unit: null }; "14501 GROVE RESORT AVENUE # 34" -> unit "34". */
export function parseStreet(street: string): StreetParts | null {
  const unitMatch = street.match(/(?:#|\bUNIT\b|\bAPT\b|\bSTE\b)\s*([A-Z0-9-]+)\s*$/i);
  const withoutUnit = unitMatch ? street.slice(0, unitMatch.index) : street;
  const words = withoutUnit.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length < 2 || !/^\d+$/.test(words[0])) return null;
  const nameWords = DIRECTIONS.has(words[1]) && words.length > 2 ? words.slice(2) : words.slice(1);
  return { number: words[0], name: nameWords[0], unit: unitMatch?.[1]?.toUpperCase() ?? null };
}

/**
 * Whether two street lines from different sources are the same house -
 * same house number and same street name. Used to make sure data pulled
 * from another source (tax roll, Zillow) is for this house and not a
 * neighbor's or a near-miss match.
 */
export function sameStreet(a: string, b: string): boolean {
  const pa = parseStreet(a);
  const pb = parseStreet(b);
  return Boolean(pa && pb && pa.number === pb.number && pa.name === pb.name);
}
