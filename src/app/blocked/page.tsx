// Deliberately generic - doesn't name the account or a reason. The owner
// handles that conversation privately; this page's only job is to not look
// like a broken error page.
export default function BlockedPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 text-center">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Access removed</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">
          This account no longer has access to Auction Clarity.
        </p>
      </div>
    </div>
  );
}
