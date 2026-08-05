"use client";

import { useState } from "react";
import type { PermitResult } from "@/lib/permits";

function formatPermitDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** Renders nothing if `permits` is null (county has no known permit data source) - see src/lib/permits/index.ts. */
export function PermitsSection({ permits }: { permits: PermitResult | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!permits) return null;

  const { permits: list, sourceLabel, sourceUrl } = permits;
  const visible = expanded ? list : list.slice(0, 3);

  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">
          🔨 Permit History{list.length > 0 ? ` (${list.length})` : ""}
        </span>
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-[11px] text-accent hover:underline"
        >
          via {sourceLabel} ↗
        </a>
      </div>

      {list.length === 0 ? (
        <p className="mt-1 text-[11px] text-muted">No permit history found on record.</p>
      ) : (
        <>
          <ul className="mt-2 flex flex-col gap-1.5">
            {visible.map((p, i) => (
              <li key={i} className="text-[11px] leading-snug">
                <span className="font-medium text-foreground">{p.description || p.type || "Permit"}</span>
                {p.status ? <span className="ml-1.5 text-muted">· {p.status}</span> : null}
                {formatPermitDate(p.issuedDate) ? (
                  <span className="ml-1.5 text-muted">· {formatPermitDate(p.issuedDate)}</span>
                ) : null}
              </li>
            ))}
          </ul>
          {list.length > 3 ? (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="mt-1.5 text-[11px] font-medium text-accent hover:underline"
            >
              {expanded ? "Show less" : `Show all ${list.length}`}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
