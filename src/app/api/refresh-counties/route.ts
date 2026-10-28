import { NextResponse } from "next/server";
import { refreshCounties } from "@/lib/refreshCounties";

// Vercel Hobby's ceiling for one run. The refresh itself stops starting new
// work well before this (REFRESH_BUDGET_MS), leaving room for whatever
// request is in flight when time runs out.
export const maxDuration = 300;
const REFRESH_BUDGET_MS = 210_000;

/**
 * Called on a schedule by Vercel (the `crons` in vercel.json), which sends
 * `Authorization: Bearer <CRON_SECRET>` when the CRON_SECRET environment
 * variable is set on the project. Not behind the normal login (see
 * PUBLIC_PATHS in src/proxy.ts) since the scheduler has no session - this
 * secret check is the only gate, and it fails closed: no CRON_SECRET set
 * means nobody can trigger it.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await refreshCounties({ budgetMs: REFRESH_BUDGET_MS }));
  } catch (err) {
    console.error("Statewide refresh failed:", err);
    return NextResponse.json({ error: "Refresh failed" }, { status: 500 });
  }
}
