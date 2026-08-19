"use client";

import { useActionState } from "react";

export type AddUserResult = { username: string; password: string } | { error: string } | null;

/**
 * Uses useActionState (not a plain redirect) specifically so the generated
 * password can be shown directly in this component's state - never put in
 * a URL/query string, which would leave it sitting in browser history for
 * a value that's only supposed to be visible once.
 */
export function AddUserForm({
  action,
}: {
  action: (prevState: AddUserResult, formData: FormData) => Promise<AddUserResult>;
}) {
  const [result, formAction, isPending] = useActionState(action, null);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">Add someone</h2>
      <form action={formAction} className="mt-2 flex items-end gap-2">
        <div className="flex-1">
          <label className="text-xs font-medium text-foreground">Username</label>
          <input
            type="text"
            name="username"
            required
            placeholder="e.g. john"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-navy hover:opacity-90 disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {result && "password" in result ? (
        <div className="mt-3 rounded-md border border-accent bg-accent-soft p-3 text-sm">
          <p className="text-foreground">
            Created <strong>{result.username}</strong>. Password:{" "}
            <code className="rounded bg-background px-1.5 py-0.5">{result.password}</code>
          </p>
          <p className="mt-1 text-xs text-muted">
            Save this now - it won&rsquo;t be shown again, it&rsquo;s not stored anywhere in plain text.
          </p>
        </div>
      ) : null}
      {result && "error" in result ? (
        <p className="mt-2 text-xs text-estimate">{result.error}</p>
      ) : null}
    </div>
  );
}
