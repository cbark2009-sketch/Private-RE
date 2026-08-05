import Link from "next/link";
import { COUNTIES } from "@/lib/counties";
import { toISODate } from "@/lib/dates";
import { ZipSearchBar } from "@/components/ZipSearchBar";

const FEATURES = [
  {
    title: "Plain-English case data",
    body: "Case number, final judgment amount, and address pulled straight from each county Clerk of Courts' own auction calendar - no legal jargon to decode.",
  },
  {
    title: "A real value estimate, not a tax estimate",
    body: "Comp-based market estimates instead of the tax-assessed value, which is often well below what a property would actually sell for.",
  },
  {
    title: "See volume before you click in",
    body: "The calendar shows how many auctions are on each day before you commit to looking - pick specific days or search a whole month by price at once.",
  },
];

export default function HomePage() {
  const today = toISODate(new Date());
  const sortedCounties = [...COUNTIES].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <section className="bg-navy py-16 text-white sm:py-24">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Auction Clarity</h1>
          <p className="mt-4 text-lg text-white/70">
            Florida foreclosure auctions, translated into plain English - with a real value
            estimate, not just the tax-assessed number.
          </p>
          <div className="mt-8 flex flex-col items-center gap-2">
            <ZipSearchBar variant="hero" />
            <span className="text-xs text-white/50">Enter a Florida zip code to get started</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-lg border border-border bg-surface p-4">
              <h3 className="text-sm font-semibold text-foreground">{f.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <h2 className="text-lg font-semibold text-foreground">
          Or browse a county directly ({sortedCounties.length} covered so far)
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {sortedCounties.map((c) => (
            <Link
              key={c.slug}
              href={`/auctions/${c.slug}/${today}`}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground hover:border-accent hover:text-accent"
            >
              {c.name}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
