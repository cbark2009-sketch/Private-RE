import { prisma } from "@/lib/db";
import { ensureTable } from "@/lib/ensureTable";
import type { County } from "@/lib/counties";
import { toISODate } from "@/lib/dates";
import { scrapeTaxDeedDate } from "@/lib/scrapeAuctions";
import { getCalendarMonthForHost } from "@/lib/getCalendarMonth";
import { getActiveDatesInRange } from "@/lib/getMultiDateListings";
import { TAX_DEED_COUNTIES, getTaxDeedCounty, taxDeedKey } from "@/lib/taxDeedCounties";
import { estimatePropertyValue, type ValueEstimate } from "@/lib/valuation";
import { attachCoordinates, type MapPoint } from "@/lib/getMapPoints";
import { getCachedParcelRecords } from "@/lib/floridaParcel";
import { taxDeedHref } from "@/lib/links";

// The tax deed side's data layer - the counterpart to getAuctionListings.ts
// for foreclosures, reading each county's RealTaxDeed site instead of its
// RealForeclose site. Same politeness and caching rules: scraped only by the
// scheduled refresh (refreshCounties.ts) or on a cache miss, rows reused for
// 24h, and pages only ever read what's stored. Never calls RentCast live -
// value estimates come from whatever's already cached, else the county's
// assessed value, so browsing tax deeds can't spend quota.

// Same SQL as the add_tax_deed_listing migration - see ensureTable.ts.
const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS "TaxDeedListing" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "countySlug" TEXT NOT NULL,
  "auctionDate" DATETIME NOT NULL,
  "caseNumber" TEXT NOT NULL,
  "caseDetailUrl" TEXT,
  "certificateNumber" TEXT,
  "openingBid" REAL,
  "propertyAddress" TEXT,
  "zipCode" TEXT,
  "assessedValue" REAL,
  "parcelId" TEXT,
  "parcelUrl" TEXT,
  "scrapedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;
const CREATE_UNIQUE_SQL = `CREATE UNIQUE INDEX IF NOT EXISTS "TaxDeedListing_countySlug_caseNumber_auctionDate_key" ON "TaxDeedListing"("countySlug", "caseNumber", "auctionDate")`;
const CREATE_INDEX_SQL = `CREATE INDEX IF NOT EXISTS "TaxDeedListing_countySlug_auctionDate_idx" ON "TaxDeedListing"("countySlug", "auctionDate")`;

async function ensureTaxDeedTable(): Promise<void> {
  await ensureTable(CREATE_TABLE_SQL);
  await ensureTable(CREATE_UNIQUE_SQL);
  await ensureTable(CREATE_INDEX_SQL);
}

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
// Same as getMapPoints.ts: a sale the county site stopped listing (taxes
// paid off, sale cancelled) keeps its row but stops being re-confirmed.
const DROPPED_AFTER_DAYS = 4;
const MAX_UPCOMING = 6000;

type TaxDeedRow = Awaited<ReturnType<typeof prisma.taxDeedListing.findMany>>[number];

/** Every date in [from, to] the county's RealTaxDeed calendar shows sales on. */
export function getTaxDeedActiveDatesInRange(county: County, from: string, to: string): Promise<string[]> {
  return getActiveDatesInRange(county.slug, from, to, async (year, month) => {
    const days = await getCalendarMonthForHost(taxDeedKey(county.slug), county.host, year, month);
    return days.filter((d) => d.active > 0).map((d) => d.date);
  });
}

/** One county's sales on one date, scraping first if they're missing or more than a day old. */
export async function getOrRefreshTaxDeedRows(county: County, auctionDate: string): Promise<TaxDeedRow[]> {
  await ensureTaxDeedTable();
  const existing = await prisma.taxDeedListing.findMany({
    where: { countySlug: county.slug, auctionDate: new Date(auctionDate) },
    orderBy: { propertyAddress: "asc" },
  });
  const isStale = existing.length === 0 || existing.some((r) => Date.now() - r.scrapedAt.getTime() > STALE_AFTER_MS);
  if (!isStale) return existing;

  const raw = await scrapeTaxDeedDate(county.host, auctionDate);
  const rows: TaxDeedRow[] = [];
  for (const sale of raw) {
    const fields = {
      caseDetailUrl: sale.caseDetailUrl,
      certificateNumber: sale.certificateNumber,
      openingBid: sale.openingBid,
      propertyAddress: sale.propertyAddress,
      zipCode: sale.zipCode,
      assessedValue: sale.assessedValue,
      parcelId: sale.parcelId,
      parcelUrl: sale.parcelUrl,
    };
    rows.push(
      await prisma.taxDeedListing.upsert({
        where: {
          countySlug_caseNumber_auctionDate: {
            countySlug: county.slug,
            caseNumber: sale.caseNumber,
            auctionDate: new Date(auctionDate),
          },
        },
        create: { countySlug: county.slug, caseNumber: sale.caseNumber, auctionDate: new Date(auctionDate), ...fields },
        update: { ...fields, scrapedAt: new Date() },
      })
    );
  }
  return rows;
}

/** View-ready tax deed sale - the tax deed counterpart to AuctionListingView. */
export interface TaxDeedView {
  countySlug: string;
  countyName: string;
  caseNumber: string;
  caseDetailUrl: string | null;
  certificateNumber: string | null;
  auctionDate: string; // YYYY-MM-DD
  openingBid: number | null;
  propertyAddress: string | null;
  zipCode: string | null;
  assessedValue: number | null;
  parcelId: string | null;
  parcelUrl: string | null;
  valueEstimate: ValueEstimate;
  /** The county's land-use label from the tax roll ("Vacant residential land", "Single family"...), once the refresh has looked it up. */
  propertyType: string | null;
  /** True when the tax roll says the parcel is vacant land - a large share of tax deed sales are. */
  vacantLand: boolean;
}

const VACANT_USE_CODES = new Set(["000", "010", "040"]);

/** Builds views for many rows at once - one bulk query each for cached estimates and tax-roll records, not one per row. */
async function toViews(rows: TaxDeedRow[]): Promise<TaxDeedView[]> {
  const addresses = rows.map((r) => r.propertyAddress).filter((a): a is string => Boolean(a));
  const estimates = addresses.length
    ? await prisma.valueEstimateCache.findMany({ where: { address: { in: addresses }, failed: false } })
    : [];
  const estimateByAddress = new Map(estimates.map((e) => [e.address, e]));
  const { records } = await getCachedParcelRecords(addresses);

  return rows.flatMap((row): TaxDeedView[] => {
    const county = getTaxDeedCounty(row.countySlug);
    if (!county) return [];
    const market = row.propertyAddress ? estimateByAddress.get(row.propertyAddress) : undefined;
    const record = row.propertyAddress ? records.get(row.propertyAddress) : undefined;
    return [
      {
        countySlug: county.slug,
        countyName: county.name,
        caseNumber: row.caseNumber,
        caseDetailUrl: row.caseDetailUrl,
        certificateNumber: row.certificateNumber,
        auctionDate: toISODate(row.auctionDate),
        openingBid: row.openingBid,
        propertyAddress: row.propertyAddress,
        zipCode: row.zipCode,
        assessedValue: row.assessedValue,
        parcelId: row.parcelId,
        parcelUrl: row.parcelUrl,
        valueEstimate: estimatePropertyValue({
          assessedValue: row.assessedValue,
          market: market ? { ...market, compCount: market.compCount ?? 0 } : null,
        }),
        propertyType: record?.propertyType ?? null,
        vacantLand: Boolean(record?.useCode && VACANT_USE_CODES.has(record.useCode)),
      },
    ];
  });
}

function upcomingWhere() {
  return {
    auctionDate: { gte: new Date(toISODate(new Date())) },
    propertyAddress: { not: null },
    scrapedAt: { gte: new Date(Date.now() - DROPPED_AFTER_DAYS * 24 * 60 * 60 * 1000) },
  };
}

/** How many properties getUpcomingTaxDeeds would return, without loading them - for the landing page's button. */
export async function countUpcomingTaxDeeds(): Promise<number> {
  await ensureTaxDeedTable();
  const rows = await prisma.taxDeedListing.findMany({
    where: upcomingWhere(),
    select: { propertyAddress: true },
    distinct: ["propertyAddress"],
  });
  return rows.length;
}

/**
 * Every upcoming, still-listed tax deed sale with an address, one per
 * property (nearest date), soonest first - what the Tax Deeds page shows
 * before any filtering. Reads only what the scheduled refresh has stored.
 */
export async function getUpcomingTaxDeeds(): Promise<TaxDeedView[]> {
  await ensureTaxDeedTable();
  const rows = await prisma.taxDeedListing.findMany({
    where: upcomingWhere(),
    orderBy: { auctionDate: "asc" },
    take: MAX_UPCOMING,
  });
  const byAddress = new Map<string, TaxDeedRow>();
  for (const row of rows) if (!byAddress.has(row.propertyAddress!)) byAddress.set(row.propertyAddress!, row);
  return toViews([...byAddress.values()]);
}

/** One sale for its property page - its most recent row, so a rescheduled sale follows its new date. */
export async function getTaxDeedForCase(countySlug: string, caseNumber: string): Promise<TaxDeedView | null> {
  await ensureTaxDeedTable();
  const row = await prisma.taxDeedListing.findFirst({
    where: { countySlug, caseNumber },
    orderBy: { auctionDate: "desc" },
  });
  return row ? ((await toViews([row]))[0] ?? null) : null;
}

/** Map dots for a set of tax deed sales - clicking one opens its tax deed page, and the preview shows the opening bid. */
export function taxDeedsToMapPoints(views: TaxDeedView[]): Promise<MapPoint[]> {
  const seen = new Set<string>();
  const points = views.flatMap((v) => {
    if (!v.propertyAddress || seen.has(v.propertyAddress)) return [];
    seen.add(v.propertyAddress);
    return [
      {
        id: `taxdeed:${v.countySlug}:${v.caseNumber}`,
        address: v.propertyAddress,
        countySlug: v.countySlug,
        countyName: v.countyName,
        caseNumber: v.caseNumber,
        auctionDate: v.auctionDate,
        judgment: v.openingBid,
        valueEstimate: v.valueEstimate.amount,
        likelyHoa: false,
        propertyType: v.propertyType,
        href: taxDeedHref(v.countySlug, v.caseNumber),
        amountLabel: "Opening bid",
      },
    ];
  });
  return attachCoordinates(points);
}

export { TAX_DEED_COUNTIES };
