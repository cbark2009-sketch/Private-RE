import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { verifyPassword, createSessionToken, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from "@/lib/auth";

async function login(formData: FormData) {
  "use server";
  // Lowercased because usernames are stored lowercase (see addUser/renameUser
  // in ceo/page.tsx) - without this, a phone/tablet keyboard autocapitalizing
  // the first letter would silently fail an otherwise-correct login.
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
    redirect("/login?error=1");
  }

  const token = createSessionToken(user.username);
  (await cookies()).set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
  redirect(user.isBlocked ? "/blocked" : "/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">Auction Clarity</h1>
        <p className="mt-1 text-sm text-muted">Sign in to continue.</p>

        <form action={login} className="mt-5 flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium text-foreground">Username</label>
            <input
              type="text"
              name="username"
              required
              autoFocus
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Password</label>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          {error ? <p className="text-xs text-estimate">Wrong username or password.</p> : null}
          <button
            type="submit"
            className="mt-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-navy hover:opacity-90"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
