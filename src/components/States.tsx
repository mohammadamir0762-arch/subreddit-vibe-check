/** Layout-matched skeleton, so the page doesn't jump when data lands. */
export function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="skeleton h-52 rounded-xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="skeleton h-72 rounded-xl" />
        <div className="skeleton h-72 rounded-xl" />
      </div>
    </div>
  );
}

export function ErrorState({ message, hint, onRetry }: { message: string; hint?: string; onRetry?: () => void }) {
  return (
    <section
      role="alert"
      className="animate-rise rounded-xl border border-edge bg-surface p-5 shadow-[var(--shadow-card)]"
      style={{ borderLeftWidth: 3, borderLeftColor: 'var(--negative)' }}
    >
      <h2 className="text-sm font-semibold" style={{ color: 'var(--negative)' }}>
        {message}
      </h2>
      {hint && <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{hint}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg border border-edge px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:text-ink"
        >
          Try again
        </button>
      )}
    </section>
  );
}

export function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-edge-strong px-6 py-16 text-center">
      <h2 className="text-base font-semibold text-ink">Pick a subreddit to read its mood</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-2">
        The 50 current Hot posts get pulled, every title is scored in your browser, and the
        result is broken down below — overall verdict, distribution, the words responsible,
        and whether the mood tracks with upvotes.
      </p>
    </div>
  );
}
