import { NextResponse } from "next/server";
import { getCalendarMonth, getCalendarMonthForZip } from "@/lib/getCalendarMonth";
import { getCounty } from "@/lib/counties";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ county: string; year: string; month: string }> }
) {
  const { county: countySlug, year, month } = await params;
  const zip = new URL(req.url).searchParams.get("zip");

  if (!getCounty(countySlug)) {
    return NextResponse.json({ error: "Unsupported county" }, { status: 404 });
  }

  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    return NextResponse.json({ error: "Invalid year/month" }, { status: 400 });
  }

  try {
    const days =
      zip && /^\d{5}$/.test(zip)
        ? await getCalendarMonthForZip(countySlug, y, m, zip)
        : await getCalendarMonth(countySlug, y, m);
    return NextResponse.json({ days });
  } catch (err) {
    console.error(`Calendar fetch failed for ${countySlug} ${y}-${m} (zip=${zip}):`, err);
    return NextResponse.json({ error: "Failed to load calendar" }, { status: 502 });
  }
}
