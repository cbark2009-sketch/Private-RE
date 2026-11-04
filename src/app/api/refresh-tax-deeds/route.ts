import { NextResponse } from "next/server";
import { refreshTaxDeedCounties } from "@/lib/refreshCounties";

// Same setup as /api/refresh-counties (see that route for why): Vercel
// Hobby's 5-minute ceiling, a budget that stops starting new work well
// before it, and CRON_SECRET as the only gate (this path skips the login
// proxy - see PUBLIC_PATHS in src/proxy.ts).
export const maxDuration = 300;
const REFRESH_BUDGET_MS = 210_000;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await refreshTaxDeedCounties({ budgetMs: REFRESH_BUDGET_MS }));
  } catch (err) {
    console.error("Tax deed refresh failed:", err);
    return NextResponse.json({ error: "Refresh failed" }, { status: 500 });
  }
}
