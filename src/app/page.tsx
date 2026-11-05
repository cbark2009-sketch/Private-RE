import Link from "next/link";
import { COUNTIES } from "@/lib/counties";
import { TAX_DEED_COUNTIES } from "@/lib/taxDeedCounties";
import { countUpcomingProperties } from "@/lib/getMapPoints";
import { countUpcomingTaxDeeds } from "@/lib/taxDeeds";
import { LogoMark } from "@/components/Logo";

// Counts change through the day as the scheduled refreshes run.
export const dynamic = "force-dynamic";

function Choice({
  href,
  title,
  description,
  count,
}: {
  href: string;
  title: string;
  description: string;
  count: string | null;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-xl border border-border bg-surface p-6 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-accent hover:shadow-lg hover:shadow-accent/10"
    >
      <span className="flex items-center justify-between gap-2 text-xl font-semibold text-foreground">
        {title}
        <span className="text-accent transition-transform group-hover:translate-x-1" aria-hidden="true">
          →
        </span>
      </span>
      <span className="text-sm leading-relaxed text-muted">{description}</span>
      {count ? <span className="mt-1 text-xs font-semibold uppercase tracking-wide text-accent">{count}</span> : null}
    </Link>
  );
}

/** The front door: the mark, and a choice between the two kinds of auction the site covers. */
export default async function LandingPage() {
  // The counts are a nice-to-have - the page works without them.
  const [foreclosures, taxDeeds] = await Promise.all([
    countUpcomingProperties().catch(() => null),
    countUpcomingTaxDeeds().catch(() => null),
  ]);

  return (
    <div className="flex min-h-[75vh] flex-col items-center justify-center px-4 py-12 text-center">
      <LogoMark className="h-20 w-20" />
      <h1 className="mt-5 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">Auction Clarity</h1>
      <p className="mt-3 max-w-xl text-base text-muted">
        Florida foreclosure and tax deed auctions, plainly explained.
      </p>

      <div className="mt-10 grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <Choice
          href="/foreclosures"
          title="Foreclosures"
          description={`Homes going to auction after the owner stopped paying the mortgage, across ${COUNTIES.length} counties.`}
          count={foreclosures ? `${foreclosures.toLocaleString()} upcoming` : null}
        />
        <Choice
          href="/tax-deeds"
          title="Tax Deeds"
          description={`Properties being sold for unpaid property taxes, across ${TAX_DEED_COUNTIES.length} counties.`}
          count={taxDeeds ? `${taxDeeds.toLocaleString()} upcoming` : null}
        />
      </div>
    </div>
  );
}
