import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";

// Node's built-in crypto, not a new dependency - Proxy (src/proxy.ts) runs
// on the Node runtime by default in Next.js 16, so this is available there
// with no extra install (and no risk of a native-module build issue on
// Vercel, unlike better-sqlite3 - see project history for that scare).

const SCRYPT_KEYLEN = 64;

/** Hashes a new password with a fresh random salt - used once, at account creation. */
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return { hash, salt };
}

/** Constant-time comparison (timingSafeEqual) so a login attempt can't be timed to guess the password byte by byte. */
export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  const candidate = scryptSync(password, salt, SCRYPT_KEYLEN);
  const stored = Buffer.from(storedHash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

function requireSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return secret;
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

/**
 * A session token is just `username.signature` - stateless (no separate
 * Session table to manage), signed with SESSION_SECRET so it can't be
 * forged. Deliberately does NOT encode isBlocked/isOwner - those are looked
 * up fresh from the DB on every request (see src/proxy.ts), so a token
 * alone never proves current access, only who's claiming to be logged in.
 */
export function createSessionToken(username: string): string {
  return `${username}.${sign(username, requireSessionSecret())}`;
}

/** Returns the username if the token's signature is valid, otherwise null. Doesn't check block status - see src/proxy.ts for that. */
export function verifySessionToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return null;

  const username = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  const expected = sign(username, requireSessionSecret());

  const sigBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expectedBuf.length) return null;
  return timingSafeEqual(sigBuf, expectedBuf) ? username : null;
}

export const SESSION_COOKIE_NAME = "session";
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30, // 30 days
};
