import { notFound } from "next/navigation";
import { getTaxDeedForCase } from "@/lib/taxDeeds";
import { getTaxDeedCounty } from "@/lib/taxDeedCounties";
import { loadHouseSources } from "@/lib/houseSources";
import { formatMoney } from "@/lib/format";
import { formatDisplayDate } from "@/lib/dates";
import { buildZillowUrl } from "@/lib/zillow";
import { decodeCaseParam } from "@/lib/links";
import { Stat } from "@/components/ListingCard";
import { TaxDeedCaveat } from "@/components/TaxDeedCard";
import { BackLink } from "@/components/BackLink";
import { PropertyLocation, AboutTheHouse, SaleHistory } from "@/components/HouseDetails";

export const dynamic = "force-dynamic";

type Params = Promise<{ county: string; caseNumber: string }>;

const FROM_LISTING = "From county listing";

export async function generateMetadata({ params }: { params: Params }) {
  const { county, caseNumber } = await params;
  const sale = await getTaxDeedForCase(county, decodeCaseParam(caseNumber));
  return { title: sale?.propertyAddress ? `${sale.propertyAddress} (tax deed) — Auction Clarity` : "Auction Clarity" };
}

/** The tax deed counterpart to the foreclosure property page - same house facts, the sale's own numbers. */
export default async function TaxDeedPropertyPage({ params }: { params: Params }) {
  const { county: countySlug, caseNumber } = await params;
  const sale = await getTaxDeedForCase(countySlug, decodeCaseParam(caseNumber));
  if (!sale || !sale.propertyAddress) notFound();
  const address = sale.propertyAddress;
  const county = getTaxDeedCounty(sale.countySlug);

  const { sources, coords } = await loadHouseSources(address, sale.parcelId);
  const { zillow } = sources;

  const value = sale.valueEstimate;
  const zillowUrl = zillow?.url ?? buildZillowUrl(address);
  const [y, m, d] = sale.auctionDate.split("-");
  const countySaleUrl = county
    ? `https://${county.host}/index.cfm?zaction=AUCTION&Zmethod=PREVIEW&AUCTIONDATE=${m}/${d}/${y}`
    : null;
  const marketValue = sources.fl?.marketValue ?? null;
  const linkClass = "font-medium text-accent hover:underline";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <BackLink />

      <header className="mt-4">
        <span className="mb-1 inline-block rounded-full border border-estimate bg-estimate-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-estimate">
          Tax deed sale
        </span>
        <h1 className="text-2xl font-semibold text-foreground">{address}</h1>
        <p className="mt-1 text-sm text-muted">
          {sale.countyName} County · Sale {formatDisplayDate(sale.auctionDate)} · Tax deed #{sale.caseNumber}
          {sale.certificateNumber ? ` · Certificate #${sale.certificateNumber}` : ""}
        </p>
      </header>

      <div className="mt-4">
        <TaxDeedCaveat />
      </div>

      <PropertyLocation address={address} coords={coords} />
      <AboutTheHouse sources={sources} />

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-foreground">Sale numbers</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Opening Bid"
            value={formatMoney(sale.openingBid)}
            badge="fact"
            factLabel={FROM_LISTING}
            note="The minimum bid: unpaid taxes, interest and fees. Bidding often goes well above it."
          />
          <Stat label="Assessed Value" value={formatMoney(sale.assessedValue)} badge="fact" factLabel={FROM_LISTING} />
          <Stat
            label={value.basis === "market-comps" ? "Market Value Estimate" : "Rough Value Estimate"}
            value={formatMoney(value.amount)}
            badge="estimate"
            note={value.note}
          />
          {zillow?.zestimate != null ? (
            <Stat
              label="Zillow Zestimate"
              value={formatMoney(zillow.zestimate)}
              badge="estimate"
              note="Zillow's own automated estimate, read from its page for this property."
            />
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {sale.openingBid != null && sale.assessedValue ? (
            <span>Opening bid is {Math.round((sale.openingBid / sale.assessedValue) * 100)}% of the assessed value</span>
          ) : null}
          {sale.openingBid && marketValue ? (
            <span>County market value is {(marketValue / sale.openingBid).toFixed(1)}× the opening bid</span>
          ) : null}
          {sale.openingBid && zillow?.zestimate != null ? (
            <span>Zestimate is {(zillow.zestimate / sale.openingBid).toFixed(1)}× the opening bid</span>
          ) : null}
        </div>
      </section>

      <SaleHistory sources={sources} />

      <section className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-4 text-sm">
        {countySaleUrl ? (
          <a href={countySaleUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
            County&rsquo;s sale page for that day ↗
          </a>
        ) : null}
        {sale.parcelUrl ? (
          <a href={sale.parcelUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
            View property appraiser ↗
          </a>
        ) : null}
        {zillowUrl ? (
          <a href={zillowUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
            Compare on Zillow ↗
          </a>
        ) : null}
      </section>
    </div>
  );
}
