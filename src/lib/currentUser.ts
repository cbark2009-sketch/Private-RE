import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

/**
 * The logged-in user's id, or null if not logged in. Doesn't check
 * isBlocked - src/proxy.ts already gates that for every page this could run
 * on, so by the time a page body executes, a resolved id is always a real,
 * unblocked user.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const username = verifySessionToken(token);
  if (!username) return null;
  const user = await prisma.user.findUnique({ where: { username } });
  return user?.id ?? null;
}
