"use client";

import { useState, useActionState } from "react";

export type RenameResult = { error: string } | null;
export type ChangePasswordResult = { password: string } | { error: string } | null;

export function UserRow({
  user,
  setBlockedAction,
  renameAction,
  changePasswordAction,
}: {
  user: { id: string; username: string; isOwner: boolean; isBlocked: boolean; addedDate: string };
  setBlockedAction: (formData: FormData) => Promise<void>;
  renameAction: (prevState: RenameResult, formData: FormData) => Promise<RenameResult>;
  changePasswordAction: (
    prevState: ChangePasswordResult,
    formData: FormData
  ) => Promise<ChangePasswordResult>;
}) {
  const [renameResult, renameFormAction, isRenaming] = useActionState(renameAction, null);
  const [pwResult, pwFormAction, isChangingPassword] = useActionState(changePasswordAction, null);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  return (
    <div className="flex flex-col gap-1.5 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <form action={renameFormAction} className="flex items-center gap-1.5">
            <input type="hidden" name="userId" value={user.id} />
            <input
              type="text"
              name="newUsername"
              defaultValue={user.username}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-32 rounded-md border border-border bg-background px-2 py-1 text-sm font-medium text-foreground"
            />
            <button
              type="submit"
              disabled={isRenaming}
              className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:bg-background disabled:opacity-50"
            >
              Save
            </button>
          </form>
          {user.isOwner ? <span className="text-xs text-accent">Owner</span> : null}
        </div>

        {!user.isOwner ? (
          <form action={setBlockedAction}>
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="blocked" value={String(!user.isBlocked)} />
            <button
              type="submit"
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                user.isBlocked
                  ? "bg-accent text-navy hover:opacity-90"
                  : "border border-estimate text-estimate hover:bg-estimate-soft"
              }`}
            >
              {user.isBlocked ? "Unblock" : "Block"}
            </button>
          </form>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        Added {user.addedDate} · {user.isBlocked ? "Blocked" : "Active"}
      </p>
      {renameResult?.error ? <p className="text-xs text-estimate">{renameResult.error}</p> : null}

      {showPasswordForm ? (
        <form action={pwFormAction} className="mt-1 flex items-center gap-1.5">
          <input type="hidden" name="userId" value={user.id} />
          <input
            type="text"
            name="newPassword"
            placeholder="Leave blank to generate one"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-48 rounded-md border border-border bg-background px-2 py-1 text-xs"
          />
          <button
            type="submit"
            disabled={isChangingPassword}
            className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:bg-background disabled:opacity-50"
          >
            Set
          </button>
          <button
            type="button"
            onClick={() => setShowPasswordForm(false)}
            className="text-xs text-muted hover:underline"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowPasswordForm(true)}
          className="w-fit text-xs text-muted hover:text-foreground hover:underline"
        >
          Change password
        </button>
      )}
      {pwResult && "password" in pwResult ? (
        <p className="text-xs text-foreground">
          New password: <code className="rounded bg-background px-1.5 py-0.5">{pwResult.password}</code>
        </p>
      ) : null}
      {pwResult && "error" in pwResult ? <p className="text-xs text-estimate">{pwResult.error}</p> : null}
    </div>
  );
}
