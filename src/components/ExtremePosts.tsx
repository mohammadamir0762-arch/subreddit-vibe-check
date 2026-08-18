import type { AnalyzedPost } from '../lib/analysis';
import { compact, signed } from '../lib/format';
import { LABEL_COLOR } from './primitives';

function Column({
  heading, posts, color, empty,
}: {
  heading: string;
  posts: AnalyzedPost[];
  color: string;
  empty: string;
}) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink">
        <span aria-hidden className="size-2.5 rounded-[2px]" style={{ backgroundColor: color }} />
        {heading}
      </h3>

      {posts.length === 0 ? (
        <p className="py-4 text-xs text-ink-3">{empty}</p>
      ) : (
        <ol className="space-y-2.5">
          {posts.map((post) => (
            <li key={post.id} className="flex items-start gap-2.5">
              <span className="tnum mt-px w-11 shrink-0 text-right text-xs font-semibold" style={{ color }}>
                {signed(post.sentiment.score)}
              </span>
              <div className="min-w-0">
                <a
                  href={post.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="line-clamp-2 text-xs leading-snug text-ink-2 underline-offset-2 hover:text-ink hover:underline"
                >
                  {post.title}
                </a>
                <p className="tnum mt-0.5 text-[11px] text-ink-3">{compact(post.score)} upvotes</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** The extremes, which are usually where the interesting posts live. */
export function ExtremePosts({ mostPositive, mostNegative }: { mostPositive: AnalyzedPost[]; mostNegative: AnalyzedPost[] }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Column
        heading="Most positive"
        posts={mostPositive}
        color={LABEL_COLOR.positive}
        empty="Not a single positive title in the whole feed."
      />
      <Column
        heading="Most negative"
        posts={mostNegative}
        color={LABEL_COLOR.negative}
        empty="No negative titles at all — unusually calm."
      />
    </div>
  );
}
