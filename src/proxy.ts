import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Guards the whole app behind one shared password via the browser's native
// Basic Auth prompt. This is built for exactly two people (see project
// history - explicitly local/personal use, not a public product), so a
// single shared password is enough; no real accounts needed. Only active
// when SITE_PASSWORD is set, so local dev (which never sets it) is never
// gated behind a login prompt.
export function proxy(request: NextRequest) {
  const sitePassword = process.env.SITE_PASSWORD;
  if (!sitePassword) return NextResponse.next();

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    const [, password] = atob(authHeader.slice("Basic ".length)).split(":");
    if (password === sitePassword) return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Auction Clarity"' },
  });
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
