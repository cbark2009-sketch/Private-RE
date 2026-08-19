import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

/** Redirects non-owners straight to `/` - doesn't reveal that this route exists or why access was denied. Re-checked on every server action below too, not just page load. */
async function requireOwner() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const username = verifySessionToken(token);
  const user = username ? await prisma.user.findUnique({ where: { username } }) : null;
  if (!user || !user.isOwner) redirect("/");
  return user;
}

async function setBlocked(formData: FormData) {
  "use server";
  const actingUser = await requireOwner();
  const userId = String(formData.get("userId"));
  const blocked = formData.get("blocked") === "true";
  if (userId === actingUser.id) return; // can't block yourself - would lock the owner out with no way back in
  await prisma.user.update({ where: { id: userId }, data: { isBlocked: blocked } });
  revalidatePath("/ceo");
}

export default async function CeoPage() {
  await requireOwner();
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-lg font-semibold text-foreground">Who has access</h1>
      <p className="mt-1 text-sm text-muted">
        Blocking someone takes effect on their very next click - they don&rsquo;t need to log
        out or in again.
      </p>

      <div className="mt-4 divide-y divide-border rounded-lg border border-border bg-surface">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between gap-3 p-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                {u.username}
                {u.isOwner ? <span className="ml-2 text-xs text-accent">Owner</span> : null}
              </p>
              <p className="text-xs text-muted">
                Added {u.createdAt.toLocaleDateString()} · {u.isBlocked ? "Blocked" : "Active"}
              </p>
            </div>
            {!u.isOwner ? (
              <form action={setBlocked}>
                <input type="hidden" name="userId" value={u.id} />
                <input type="hidden" name="blocked" value={String(!u.isBlocked)} />
                <button
                  type="submit"
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                    u.isBlocked
                      ? "bg-accent text-navy hover:opacity-90"
                      : "border border-estimate text-estimate hover:bg-estimate-soft"
                  }`}
                >
                  {u.isBlocked ? "Unblock" : "Block"}
                </button>
              </form>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
