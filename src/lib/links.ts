/** URL of a listing's own property page. Case numbers can contain spaces and parentheses ("2023-CA-000050-O (COUNT II)"), hence the encoding. */
export function propertyHref(countySlug: string, caseNumber: string): string {
  return `/property/${countySlug}/${encodeURIComponent(caseNumber)}`;
}

/**
 * Reverses the encoding above for a page's route param, which arrives still
 * percent-encoded ("2026-CA-004234-O%20(cts%20I%2C...") - verified, not
 * assumed. Case numbers never contain a literal "%", so this can't
 * double-decode one.
 */
export function decodeCaseParam(caseNumber: string): string {
  try {
    return decodeURIComponent(caseNumber);
  } catch {
    return caseNumber;
  }
}

/** URL of a tax deed sale's own property page - same idea, under the Tax Deeds section. */
export function taxDeedHref(countySlug: string, caseNumber: string): string {
  return `/tax-deeds/${countySlug}/${encodeURIComponent(caseNumber)}`;
}
