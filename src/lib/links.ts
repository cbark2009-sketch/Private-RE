/** URL of a listing's own property page. Case numbers can contain spaces and parentheses ("2023-CA-000050-O (COUNT II)"), hence the encoding. */
export function propertyHref(countySlug: string, caseNumber: string): string {
  return `/property/${countySlug}/${encodeURIComponent(caseNumber)}`;
}
