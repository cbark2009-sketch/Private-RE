import type { Permit } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 AuctionClarityBot/0.1 (personal research tool)";

function toIsoDateFromSocrata(s: string | null | undefined): string | null {
  return s ? s.slice(0, 10) : null;
}

function toIsoDateFromEpoch(ms: unknown): string | null {
  if (typeof ms !== "number") return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

interface ArcGisQueryResponse {
  features?: { attributes: Record<string, unknown> }[];
  error?: { message?: string };
}

async function queryArcGis(baseUrl: string, whereClause: string, outFields: string, orderBy: string): Promise<ArcGisQueryResponse["features"]> {
  const url =
    `${baseUrl}/query?f=json&outFields=${outFields}&resultRecordCount=50` +
    `&orderByFields=${encodeURIComponent(orderBy)}&where=${encodeURIComponent(whereClause)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`ArcGIS query failed (${res.status}): ${url}`);
  const body = (await res.json()) as ArcGisQueryResponse;
  if (body.error) throw new Error(`ArcGIS query error: ${body.error.message ?? JSON.stringify(body.error)}`);
  return body.features ?? [];
}

// City of Orlando - Socrata open-data API. Covers Orlando specifically, not
// all of Orange County (unincorporated areas / other cities in the county
// aren't in this dataset - a parcel outside city limits will just come back
// with a real empty list, same as a property with genuinely zero permits).
interface OrlandoRow {
  permit_number?: string;
  application_type?: string;
  worktype?: string;
  project_name?: string;
  location?: string;
  application_status?: string;
  processed_date?: string;
  issue_permit_date?: string;
  contractor_name?: string;
  estimated_cost?: string;
}

export async function fetchOrlandoPermits(parcelId: string): Promise<Permit[]> {
  const url =
    `https://data.cityoforlando.net/resource/ryhf-m453.json?parcel_number=${encodeURIComponent(parcelId)}` +
    `&$order=processed_date DESC&$limit=50`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Orlando permit lookup failed: ${res.status}`);
  const rows = (await res.json()) as OrlandoRow[];

  return rows.map((r) => ({
    permitNumber: r.permit_number ?? null,
    type: r.worktype ?? r.application_type ?? null,
    description: r.project_name ?? r.location ?? r.application_type ?? null,
    status: r.application_status ?? null,
    submittedDate: toIsoDateFromSocrata(r.processed_date),
    issuedDate: toIsoDateFromSocrata(r.issue_permit_date) ?? toIsoDateFromSocrata(r.processed_date),
    contractor: r.contractor_name ?? null,
    estimatedCost: r.estimated_cost ? Number(r.estimated_cost) : null,
  }));
}

// City of Fort Lauderdale - the city's own ArcGIS REST service. Covers Fort
// Lauderdale specifically, not all of Broward County - same "outside the
// city just looks like zero permits" caveat as Orlando above.
export async function fetchFortLauderdalePermits(parcelId: string): Promise<Permit[]> {
  const features = await queryArcGis(
    "https://gis.fortlauderdale.gov/arcgis/rest/services/BuildingPermitTracker/BuildingPermitTracker/MapServer/0",
    `PARCELID='${parcelId}'`,
    "PERMITID,PERMITTYPE,PERMITDESC,PERMITSTAT,SUBMITDT,APPROVEDT,CONTRACTOR,ESTCOST",
    "SUBMITDT DESC"
  );

  return (features ?? []).map(({ attributes: a }) => ({
    permitNumber: str(a.PERMITID),
    type: str(a.PERMITTYPE),
    description: str(a.PERMITDESC),
    status: str(a.PERMITSTAT),
    submittedDate: toIsoDateFromEpoch(a.SUBMITDT),
    issuedDate: toIsoDateFromEpoch(a.APPROVEDT) ?? toIsoDateFromEpoch(a.SUBMITDT),
    contractor: str(a.CONTRACTOR),
    estimatedCost: typeof a.ESTCOST === "number" ? a.ESTCOST : null,
  }));
}

// Miami-Dade County - the county's own ArcGIS REST service (gisweb, not the
// public-facing opendata.miamidade.gov Hub site, which doesn't expose this
// layer). This one is genuinely county-wide, not city-scoped. RealForeclose
// displays this county's parcel/folio numbers WITH dashes
// ("30-5902-005-0760") but the GIS layer's FOLIO field has them stripped
// ("3059020050760") - matching requires stripping dashes first.
export async function fetchMiamiDadePermits(parcelId: string): Promise<Permit[]> {
  const folio = parcelId.replace(/-/g, "");
  const features = await queryArcGis(
    "https://gisweb.miamidade.gov/arcgis/rest/services/MD_LandInformation/MapServer/1",
    `FOLIO='${folio}'`,
    "ID,TYPE,FFRMLINE,BPSTATUS,ISSUDATE,CONTRNAME",
    "ISSUDATE DESC"
  );

  return (features ?? []).map(({ attributes: a }) => ({
    permitNumber: a.ID != null ? String(a.ID) : null,
    type: str(a.TYPE),
    description: str(a.FFRMLINE),
    status: str(a.BPSTATUS),
    submittedDate: null,
    issuedDate: toIsoDateFromEpoch(a.ISSUDATE),
    contractor: str(a.CONTRNAME),
    estimatedCost: null,
  }));
}
