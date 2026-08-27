/**
 * Florida case numbers encode a case-type code the court itself assigns -
 * "CA" for Circuit Civil (the standard track for ordinary mortgage
 * foreclosures) vs "CC" or, in counties running their own 4-letter division
 * codes (Broward's Odyssey system: COCE/CONO/COSO/COWE), anything starting
 * "CO" for County Civil - the lower-dollar track. Verified against real
 * cached data before relying on this: Broward's CACE-prefixed cases average
 * ~$347k in judgments, its CO*-prefixed cases average ~$13k - in a
 * foreclosure-only dataset, a small-dollar county-court case is overwhelmingly
 * an HOA/condo association lien foreclosure, not a mortgage.
 *
 * The exact format varies by county (dash- or space-separated, embedded
 * with no separator right after the year, or - Volusia's "CIDL" - not using
 * CA/CC at all), so this looks for the first short (2-4 letter) alphabetic
 * run in the case number and classifies only by its first two letters,
 * returning false for anything else rather than guessing.
 */
export function isLikelyHoaOrLienCase(caseNumber: string): boolean {
  const withoutParens = caseNumber.replace(/\([^)]*\)/g, "");
  const codeToken = withoutParens.match(/[A-Za-z]+/g)?.find((run) => run.length >= 2 && run.length <= 4);
  if (!codeToken) return false;

  const prefix = codeToken.slice(0, 2).toUpperCase();
  if (prefix === "CA") return false;
  return prefix === "CC" || prefix === "CO";
}
