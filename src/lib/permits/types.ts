// Every jurisdiction's permit system has a different schema (see sources.ts)
// - this is the shape they all get normalized into so the rest of the app
// only deals with one format.
export interface Permit {
  permitNumber: string | null;
  type: string | null;
  description: string | null;
  status: string | null;
  submittedDate: string | null; // ISO date (YYYY-MM-DD)
  issuedDate: string | null; // ISO date (YYYY-MM-DD)
  contractor: string | null;
  estimatedCost: number | null;
}
