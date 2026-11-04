import Link from "next/link";
import type { TaxDeedView } from "@/lib/taxDeeds";
import { taxDeedHref } from "@/lib/links";
import { formatMoney } from "@/lib/format";
import { formatShortDate } from "@/lib/dates";
import { buildZillowUrl } from "@/lib/zillow";
import { Stat } from "@/components/ListingCard";

const FROM_LISTING = "From county listing";

/**
 * How a tax deed sale differs from a foreclosure, in plain terms - shown on
 * the Tax Deeds page and every tax deed property page, the same way the
 * homepage warns about junior-lien foreclosures. Florida law: the opening
 * bid is the certificate, taxes, interest and costs (Ch. 197.502), plus half
 * the assessed value for homestead property; a tax deed wipes out most
 * liens, but government liens, special assessments and easements survive
 * (197.552).
 */
export function TaxDeedCaveat() {
  return (
    <div className="rounded-lg border border-estimate bg-estimate-soft p-3 text-xs leading-relaxed text-estimate">
      <strong>Tax deeds aren&rsquo;t foreclosures.</strong>{" "}The opening bid covers the unpaid taxes,
      interest and fees (and, for a homesteaded property, half its assessed value). The sale wipes out
      most liens, but some government liens, special assessments and easements survive it, and the title
      usually needs a quiet-title action before it can be insured or resold easily. A large share of
      these are vacant lots. Check the county&rsquo;s tax deed file for each property before bidding.
    </div>
  );
}

/** The tax deed counterpart to ListingCard - an opening bid instead of a judgment and max bid. */
export function TaxDeedCard({ sale }: { sale: TaxDeedView }) {
  const address = sale.propertyAddress;
  const detailsHref = taxDeedHref(sale.countySlug, sale.caseNumber);
  const zillowUrl = address ? buildZillowUrl(address) : null;
  const bidShareOfAssessed =
    sale.openingBid != null && sale.assessedValue ? Math.round((sale.openingBid / sale.assessedValue) * 100) : null;

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg hover:shadow-accent/10">
      <div className="relative aspect-[16/9] w-full bg-border">
        <span className="absolute left-2 top-2 z-10 rounded-full bg-navy/90 px-2 py-1 text-[11px] font-semibold text-white shadow">
          {sale.countyName} · {formatShortDate(sale.auctionDate)}
        </span>
        {address ? (
          <iframe
            title={`Map of ${address}`}
            src={`https://maps.google.com/maps?q=${encodeURIComponent(address)}&t=k&z=18&output=embed`}
            loading="lazy"
            className="h-full w-full border-0"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted">No property address on file</div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div>
          {sale.propertyType ? (
            <span className="mb-1 inline-block rounded-full border border-accent/40 bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
              {sale.propertyType}
            </span>
          ) : null}
          <h3 className="text-base font-semibold text-foreground">
            {address ? (
              // prefetch off for the same reason as ListingCard: opening a
              // property page can spend a RentCast lookup.
              <Link href={detailsHref} prefetch={false} className="hover:text-accent hover:underline">
                {address}
              </Link>
            ) : (
              "No address on file"
            )}
          </h3>
          <p className="text-xs text-muted">
            Tax deed #{sale.caseNumber}
            {sale.certificateNumber ? ` · Certificate #${sale.certificateNumber}` : ""}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Stat
            label="Opening Bid"
            value={formatMoney(sale.openingBid)}
            badge="fact"
            factLabel={FROM_LISTING}
            note={bidShareOfAssessed != null ? `${bidShareOfAssessed}% of the assessed value` : undefined}
          />
          <Stat label="Assessed Value" value={formatMoney(sale.assessedValue)} badge="fact" factLabel={FROM_LISTING} />
          <Stat
            label={sale.valueEstimate.basis === "market-comps" ? "Market Value Estimate" : "Rough Value Estimate"}
            value={formatMoney(sale.valueEstimate.amount)}
            badge="estimate"
          />
        </div>

        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-xs">
          {address ? (
            <Link href={detailsHref} prefetch={false} className="font-semibold text-accent hover:underline">
              Property details →
            </Link>
          ) : null}
          {sale.parcelUrl ? (
            <a href={sale.parcelUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
              View property appraiser ↗
            </a>
          ) : null}
          {zillowUrl ? (
            <a href={zillowUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
              Compare on Zillow ↗
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
