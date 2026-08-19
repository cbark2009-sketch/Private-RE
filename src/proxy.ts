import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Reachable without a valid session - the login page itself (and whatever
// it POSTs to, which is the same URL via a Server Action) and the blocked
// page, since a blocked or logged-out person still needs to be able to see
// *why*. Everything else requires a real account. Replaces the old single
// shared SITE_PASSWORD Basic Auth (see project history) now that access is
// per-person.
const PUBLIC_PATHS = ["/login", "/blocked"];

export async function proxy(request: NextRequest) {
  // Same convenience as the old SITE_PASSWORD-unset behavior: an unset
  // SESSION_SECRET (a fresh local clone that hasn't set one up) skips auth
  // entirely rather than crashing - verifySessionToken would otherwise
  // throw on every request. Production always has this set (see
  // .env.example), so this never applies to a real deployment.
  if (!process.env.SESSION_SECRET) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const username = verifySessionToken(token);
  if (!username) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Checked fresh against the DB on every request, not encoded in the
  // token itself - the whole point of the owner being able to block
  // someone is that it takes effect immediately, not on their next login.
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || user.isBlocked) {
    return NextResponse.redirect(new URL("/blocked", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
