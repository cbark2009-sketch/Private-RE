import { AuctionListingView } from "@/lib/getAuctionListings";
import { formatMoney } from "@/lib/format";
import { formatShortDate } from "@/lib/dates";
import { PermitsSection } from "@/components/PermitsSection";
import { buildZillowUrl } from "@/lib/zillow";

function EstimateBadge() {
  return (
    <span className="inline-block rounded-full bg-estimate-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-estimate">
      Estimate
    </span>
  );
}

function FactBadge() {
  return (
    <span className="inline-block rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
      From case record
    </span>
  );
}

function Stat({
  label,
  value,
  badge,
  note,
}: {
  label: string;
  value: string;
  badge: "fact" | "estimate";
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-background/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{label}</span>
        {badge === "fact" ? <FactBadge /> : <EstimateBadge />}
      </div>
      <span className="text-lg font-semibold text-foreground tabular-nums">{value}</span>
      {note ? <p className="text-[11px] leading-snug text-muted">{note}</p> : null}
    </div>
  );
}

export function ListingCard({
  listing,
  showDate = false,
  countyName,
}: {
  listing: AuctionListingView;
  /** Show which auction date this card is from - turn on for combined multi-date views. */
  showDate?: boolean;
  /** Show which county this card is from - for cross-county views like the homepage's good-deals section. */
  countyName?: string;
}) {
  const mapQuery = encodeURIComponent(listing.propertyAddress ?? "");
  const zillowUrl = listing.propertyAddress ? buildZillowUrl(listing.propertyAddress) : null;
  const hasAddress = Boolean(listing.propertyAddress);
  const badge = [countyName, showDate ? formatShortDate(listing.auctionDate) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg hover:shadow-accent/10">
      <div className="relative aspect-[16/9] w-full bg-border">
        {badge ? (
          <span className="absolute left-2 top-2 z-10 rounded-full bg-navy/90 px-2 py-1 text-[11px] font-semibold text-white shadow">
            {badge}
          </span>
        ) : null}
        {hasAddress ? (
          <iframe
            title={`Map of ${listing.propertyAddress}`}
            src={`https://maps.google.com/maps?q=${mapQuery}&t=k&z=18&output=embed`}
            loading="lazy"
            className="h-full w-full border-0"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted">
            No property address on file
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {listing.propertyAddress ?? "No address on file (e.g. timeshare interest)"}
          </h3>
          <p className="text-xs text-muted">Case #{listing.caseNumber}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Stat
            label="Final Judgment"
            value={formatMoney(listing.finalJudgmentAmount)}
            badge="fact"
          />
          <Stat
            label="Assessed (Tax) Value"
            value={formatMoney(listing.assessedValue)}
            badge="fact"
          />
          <Stat
            label="Est. Plaintiff Max Bid"
            value={formatMoney(listing.estimatedMaxBid)}
            badge="estimate"
            note="Real max bid is hidden until the auction. This assumes the lender bids up to the judgment amount, the common real-world pattern."
          />
          <Stat
            label={listing.valueEstimate.basis === "market-comps" ? "Market Value Estimate" : "Rough Value Estimate"}
            value={formatMoney(listing.valueEstimate.amount)}
            badge="estimate"
            note={listing.valueEstimate.note}
          />
        </div>

        {listing.valueEstimate.basis === "market-comps" ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-estimate-soft/40 px-3 py-2 text-[11px] text-muted">
            {listing.valueEstimate.rangeLow != null && listing.valueEstimate.rangeHigh != null ? (
              <span>
                Range: {formatMoney(listing.valueEstimate.rangeLow)}–{formatMoney(listing.valueEstimate.rangeHigh)}
              </span>
            ) : null}
            {listing.valueEstimate.subjectSquareFootage != null ? (
              <span>{listing.valueEstimate.subjectSquareFootage.toLocaleString()} sqft</span>
            ) : null}
            {listing.valueEstimate.compAvgPricePerSqft != null && listing.valueEstimate.compCount ? (
              <span>
                {formatMoney(listing.valueEstimate.compAvgPricePerSqft)}/sqft avg across{" "}
                {listing.valueEstimate.compCount} nearby comps
              </span>
            ) : null}
          </div>
        ) : null}

        <PermitsSection permits={listing.permits} />

        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-xs">
          {listing.caseDetailUrl ? (
            <a
              href={listing.caseDetailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent hover:underline"
            >
              View case record ↗
            </a>
          ) : null}
          {listing.parcelUrl ? (
            <a
              href={listing.parcelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent hover:underline"
            >
              View property appraiser ↗
            </a>
          ) : null}
          {zillowUrl ? (
            <a
              href={zillowUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent hover:underline"
            >
              Compare on Zillow ↗
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
