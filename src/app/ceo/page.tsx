import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE_NAME, hashPassword } from "@/lib/auth";
import { AddUserForm, type AddUserResult } from "@/components/AddUserForm";
import { UserRow, type RenameResult, type ChangePasswordResult } from "@/components/UserRow";

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

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

async function renameUser(_prevState: RenameResult, formData: FormData): Promise<RenameResult> {
  "use server";
  await requireOwner();
  const userId = String(formData.get("userId"));
  const newUsername = String(formData.get("newUsername") ?? "").trim().toLowerCase();

  if (!newUsername) return { error: "Username can't be empty." };
  if (!USERNAME_PATTERN.test(newUsername)) return { error: "Only letters, numbers, - and _ are allowed." };

  const existing = await prisma.user.findUnique({ where: { username: newUsername } });
  if (existing && existing.id !== userId) return { error: `"${newUsername}" is already taken.` };

  await prisma.user.update({ where: { id: userId }, data: { username: newUsername } });
  revalidatePath("/ceo");
  return null;
}

// Renaming changes what a person's existing session token refers to (it's
// signed with their username), so it stops matching on their next request
// and they land back at /login - not a bug, just means "log in again with
// your new username and the same password" after a rename, same as a real
// account-name change on most sites.
async function addUser(_prevState: AddUserResult, formData: FormData): Promise<AddUserResult> {
  "use server";
  await requireOwner();
  const username = String(formData.get("username") ?? "").trim().toLowerCase();

  if (!username) return { error: "Username can't be empty." };
  if (!USERNAME_PATTERN.test(username)) return { error: "Only letters, numbers, - and _ are allowed." };

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return { error: `"${username}" is already taken.` };

  const password = randomBytes(9).toString("base64url");
  const { hash, salt } = hashPassword(password);
  await prisma.user.create({ data: { username, passwordHash: hash, passwordSalt: salt } });
  revalidatePath("/ceo");
  return { username, password };
}

async function changePassword(
  _prevState: ChangePasswordResult,
  formData: FormData
): Promise<ChangePasswordResult> {
  "use server";
  await requireOwner();
  const userId = String(formData.get("userId"));
  const typed = String(formData.get("newPassword") ?? "").trim();
  if (typed && typed.length < 8) return { error: "Password must be at least 8 characters." };

  const password = typed || randomBytes(9).toString("base64url");
  const { hash, salt } = hashPassword(password);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: hash, passwordSalt: salt } });
  revalidatePath("/ceo");
  return { password };
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

      <div className="mt-4">
        <AddUserForm action={addUser} />
      </div>

      <div className="mt-4 divide-y divide-border rounded-lg border border-border bg-surface">
        {users.map((u) => (
          <UserRow
            key={u.id}
            user={{
              id: u.id,
              username: u.username,
              isOwner: u.isOwner,
              isBlocked: u.isBlocked,
              addedDate: u.createdAt.toLocaleDateString(),
            }}
            setBlockedAction={setBlocked}
            renameAction={renameUser}
            changePasswordAction={changePassword}
          />
        ))}
      </div>
    </div>
  );
}
