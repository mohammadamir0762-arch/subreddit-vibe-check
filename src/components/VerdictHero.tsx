import type { Analysis } from '../lib/analysis';
import { compact, signed } from '../lib/format';
import { LABEL_COLOR } from '../lib/labels';

/**
 * The dashboard's single hero figure — the mean title sentiment, with the
 * plain-language verdict it maps to and a track showing where it falls on the
 * full [-1, +1] range. Exactly one of these per view, by design.
 */
export function VerdictHero({
  subreddit,
  analysis,
  fetchedAt,
}: {
  subreddit: string;
  analysis: Analysis;
  fetchedAt: string;
}) {
  const color = LABEL_COLOR[analysis.verdict.polarity];
  // Map [-1, 1] onto the track's 0–100%.
  const markerPercent = ((analysis.mean + 1) / 2) * 100;

  return (
    <section
      className="animate-rise overflow-hidden rounded-xl border border-edge bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8"
      style={{ borderTopColor: color, borderTopWidth: 3 }}
    >
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-3">
            r/{subreddit} · 50 hot posts
          </p>

          <div className="mt-2 flex items-baseline gap-4">
            <span
              className="text-5xl font-semibold leading-none tracking-tight sm:text-6xl"
              style={{ color }}
            >
              {signed(analysis.mean)}
            </span>
            <span className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {analysis.verdict.title}
            </span>
          </div>

          <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink-2">
            {analysis.verdict.description}
          </p>
        </div>

        <dl className="grid shrink-0 grid-cols-3 gap-x-6 gap-y-1 text-right">
          {(['positive', 'neutral', 'negative'] as const).map((label) => (
            <div key={label}>
              <dd className="tnum text-xl font-semibold" style={{ color: LABEL_COLOR[label] }}>
                {analysis.counts[label]}
              </dd>
              <dt className="text-[11px] capitalize text-ink-3">{label}</dt>
            </div>
          ))}
        </dl>
      </div>

      {/* Position of the mean on the full score range. */}
      <div className="mt-7">
        <div
          className="relative h-2 w-full rounded-full"
          style={{
            background: 'linear-gradient(90deg, color-mix(in oklab, var(--negative) 40%, transparent), var(--surface-sunken) 50%, color-mix(in oklab, var(--positive) 40%, transparent))',
          }}
        >
          <div
            className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-[left] duration-500"
            style={{ left: `${markerPercent}%`, backgroundColor: color, borderColor: 'var(--surface)' }}
            aria-hidden
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-ink-3">
          <span>−1.0 hostile</span>
          <span>0 neutral</span>
          <span>+1.0 glowing</span>
        </div>
      </div>

      <p className="mt-5 border-t border-edge pt-3 text-xs text-ink-3">
        {compact(analysis.posts.reduce((sum, p) => sum + p.score, 0))} combined upvotes ·{' '}
        {compact(analysis.posts.reduce((sum, p) => sum + p.numComments, 0))} comments · fetched{' '}
        {new Date(fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </p>
    </section>
  );
}
