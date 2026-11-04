import type { Coordinates } from "@/lib/geocode";
import { formatMoney } from "@/lib/format";
import { houseFacts, salesList, sourceNames, type HouseSources } from "@/lib/houseSources";

// The parts of a property page that are about the building, not the sale -
// shared by the foreclosure and tax deed property pages.

const linkClass = "font-medium text-accent hover:underline";

/** Where it is: the house itself up close, and the neighborhood around it, plus Google Maps / Street View links. */
export function PropertyLocation({ address, coords }: { address: string; coords: Coordinates | null }) {
  const mapQuery = encodeURIComponent(address);
  return (
    <>
      <section className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[3fr_2fr]">
        <iframe
          title={`Satellite view of ${address}`}
          src={`https://maps.google.com/maps?q=${mapQuery}&t=k&z=19&output=embed`}
          className="h-[320px] w-full rounded-lg border border-border md:h-[400px]"
        />
        <iframe
          title={`Map of the area around ${address}`}
          src={`https://maps.google.com/maps?q=${mapQuery}&t=m&z=14&output=embed`}
          className="h-[260px] w-full rounded-lg border border-border md:h-[400px]"
        />
      </section>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          Open in Google Maps ↗
        </a>
        {coords ? (
          <a
            href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${coords.lat},${coords.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            Street View ↗
          </a>
        ) : null}
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface p-3">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-base font-semibold text-foreground">{value ?? "Unknown"}</span>
    </div>
  );
}

export function AboutTheHouse({ sources }: { sources: HouseSources }) {
  const hasHouseData = Boolean(sources.fl || sources.zillow || sources.rentcast);
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-foreground">About the house</h2>
      {hasHouseData ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {houseFacts(sources)
              .filter((f) => f.always || f.value != null)
              .map((f) => (
                <Fact key={f.label} label={f.label} value={f.value} />
              ))}
          </div>
          <p className="mt-2 text-[11px] text-muted">
            From {sourceNames(sources).join(", ")}. Records can be out of date or miss recent additions -
            confirm with the property appraiser before bidding.
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border bg-surface p-4 text-sm text-muted">
          House details aren&rsquo;t available for this address right now. The property appraiser link
          below has the county&rsquo;s own record.
        </p>
      )}
    </section>
  );
}

export function SaleHistory({ sources }: { sources: HouseSources }) {
  const sales = salesList(sources);
  if (!sales.length) return null;
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-foreground">Sale history</h2>
      <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface text-sm">
        {sales.map((s) => (
          <li key={s.sortKey} className="flex justify-between gap-4 px-3 py-2">
            <span className="text-muted">{s.when}</span>
            <span className="font-medium text-foreground tabular-nums">{formatMoney(s.price)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
