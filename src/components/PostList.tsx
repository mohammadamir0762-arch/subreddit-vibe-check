import { useMemo, useState } from 'react';
import type { AnalyzedPost } from '../lib/analysis';
import type { Label } from '../lib/sentiment';
import { compact, relativeTime, signed } from '../lib/format';
import { LABEL_COLOR, LABEL_TEXT } from '../lib/labels';

/** Small inline meter showing where one title falls on [-1, +1]. */
function ScoreMeter({ score, label }: { score: number; label: Label }) {
  const magnitude = Math.abs(score) * 50;
  return (
    <span className="flex items-center gap-2">
      <span className="relative hidden h-1.5 w-16 shrink-0 rounded-full bg-sunken sm:block">
        <span className="absolute inset-y-0 left-1/2 w-px bg-axis" aria-hidden />
        <span
          className="absolute inset-y-0 rounded-full"
          style={{
            backgroundColor: LABEL_COLOR[label],
            width: `${Math.max(magnitude, score === 0 ? 0 : 2)}%`,
            left: score >= 0 ? '50%' : `${50 - magnitude}%`,
          }}
        />
      </span>
      <span className="tnum w-12 text-right text-xs font-medium" style={{ color: LABEL_COLOR[label] }}>
        {signed(score)}
      </span>
    </span>
  );
}

type SortKey = 'hot' | 'sentiment' | 'upvotes' | 'comments';

const SORTS: Array<{ key: SortKey; name: string }> = [
  { key: 'hot', name: 'Hot rank' },
  { key: 'sentiment', name: 'Sentiment' },
  { key: 'upvotes', name: 'Upvotes' },
  { key: 'comments', name: 'Comments' },
];

const FILTERS: Array<{ key: Label | 'all'; name: string }> = [
  { key: 'all', name: 'All' },
  { key: 'positive', name: 'Positive' },
  { key: 'neutral', name: 'Neutral' },
  { key: 'negative', name: 'Negative' },
];

/** Every analyzed post, sortable and filterable — the raw evidence behind the charts. */
export function PostList({ posts }: { posts: AnalyzedPost[] }) {
  const [sort, setSort] = useState<SortKey>('hot');
  const [filter, setFilter] = useState<Label | 'all'>('all');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    // Hot rank is the order Reddit returned, so the unsorted array *is* the ranking.
    const ranked = posts.map((post, index) => ({ post, rank: index + 1 }));

    const filtered = ranked.filter(({ post }) => {
      if (filter !== 'all' && post.sentiment.label !== filter) return false;
      if (needle && !post.title.toLowerCase().includes(needle)) return false;
      return true;
    });

    const compare = {
      hot: (a: typeof filtered[number], b: typeof filtered[number]) => a.rank - b.rank,
      sentiment: (a: typeof filtered[number], b: typeof filtered[number]) =>
        b.post.sentiment.score - a.post.sentiment.score,
      upvotes: (a: typeof filtered[number], b: typeof filtered[number]) => b.post.score - a.post.score,
      comments: (a: typeof filtered[number], b: typeof filtered[number]) =>
        b.post.numComments - a.post.numComments,
    }[sort];

    return [...filtered].sort(compare);
  }, [posts, sort, filter, query]);

  return (
    <div>
      {/* Filters sit in one row above the content they act on. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-edge bg-sunken p-0.5">
          {FILTERS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              aria-pressed={filter === option.key}
              className={`rounded-[6px] px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === option.key ? 'bg-surface text-ink shadow-[var(--shadow-card)]' : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              {option.name}
            </button>
          ))}
        </div>

        <label className="sr-only" htmlFor="post-filter">Filter titles</label>
        <input
          id="post-filter"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter titles…"
          className="min-w-0 flex-1 rounded-lg border border-edge bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
        />

        <label className="sr-only" htmlFor="post-sort">Sort by</label>
        <select
          id="post-sort"
          value={sort}
          onChange={(event) => setSort(event.target.value as SortKey)}
          className="rounded-lg border border-edge bg-surface px-2.5 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
        >
          {SORTS.map((option) => (
            <option key={option.key} value={option.key}>Sort: {option.name}</option>
          ))}
        </select>
      </div>

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-3">No posts match those filters.</p>
      ) : (
        <ul className="divide-y divide-edge">
          {visible.map(({ post, rank }) => (
            <li key={post.id} className="flex items-start gap-3 py-3">
              <span className="tnum w-6 shrink-0 pt-0.5 text-right text-xs text-ink-3">{rank}</span>

              <div className="min-w-0 flex-1">
                <a
                  href={post.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium leading-snug text-ink decoration-ink-3 underline-offset-2 hover:underline"
                >
                  {post.title}
                </a>

                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-3">
                  <span>u/{post.author}</span>
                  <span aria-hidden>·</span>
                  <span className="tnum">{compact(post.score)} upvotes</span>
                  <span aria-hidden>·</span>
                  <span className="tnum">{compact(post.numComments)} comments</span>
                  <span aria-hidden>·</span>
                  <span>{relativeTime(post.createdUtc)}</span>
                  {post.flair && (
                    <span className="rounded bg-sunken px-1.5 py-px text-ink-2">{post.flair}</span>
                  )}
                </p>

                {post.sentiment.words.length > 0 && (
                  <p className="mt-1.5 flex flex-wrap gap-1">
                    {post.sentiment.words.slice(0, 6).map((hit) => (
                      <span
                        key={hit.word}
                        className="rounded px-1.5 py-px text-[11px]"
                        style={{
                          color: hit.weight > 0 ? LABEL_COLOR.positive : LABEL_COLOR.negative,
                          backgroundColor: `color-mix(in oklab, ${
                            hit.weight > 0 ? LABEL_COLOR.positive : LABEL_COLOR.negative
                          } 12%, transparent)`,
                        }}
                        title={`weight ${signed(hit.weight)}`}
                      >
                        {hit.word}
                      </span>
                    ))}
                  </p>
                )}
              </div>

              <span className="shrink-0 pt-0.5" title={LABEL_TEXT[post.sentiment.label]}>
                <ScoreMeter score={post.sentiment.score} label={post.sentiment.label} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
