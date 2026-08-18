import type { Analysis } from '../lib/analysis';
import { percent, signed } from '../lib/format';
import { Legend } from './primitives';
import { LABEL_COLOR, LABEL_TEXT } from '../lib/labels';

export interface ComparisonSide {
  subreddit: string;
  analysis: Analysis;
}

const ORDER = ['positive', 'neutral', 'negative'] as const;

function Side({ side }: { side: ComparisonSide }) {
  const { analysis } = side;
  const color = LABEL_COLOR[analysis.verdict.polarity];

  return (
    <div className="min-w-0 flex-1 rounded-lg border border-edge bg-sunken p-4">
      <p className="truncate text-xs font-medium text-ink-3">r/{side.subreddit}</p>

      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight" style={{ color }}>
          {signed(analysis.mean)}
        </span>
        <span className="truncate text-sm font-medium text-ink">{analysis.verdict.title}</span>
      </div>

      <div className="mt-3 flex h-2 gap-[2px] overflow-hidden rounded-full">
        {ORDER.filter((label) => analysis.counts[label] > 0).map((label) => (
          <div
            key={label}
            style={{ flexGrow: analysis.shares[label], flexBasis: 0, backgroundColor: LABEL_COLOR[label] }}
          />
        ))}
      </div>

      <dl className="mt-3 space-y-1 text-[11px]">
        {ORDER.map((label) => (
          <div key={label} className="flex justify-between text-ink-3">
            <dt>{LABEL_TEXT[label]}</dt>
            <dd className="tnum text-ink-2">
              {analysis.counts[label]} · {percent(analysis.shares[label])}
            </dd>
          </div>
        ))}
        <div className="flex justify-between border-t border-edge pt-1 text-ink-3">
          <dt>Divisiveness</dt>
          <dd className="tnum text-ink-2">{analysis.spread.toFixed(2)}</dd>
        </div>
      </dl>
    </div>
  );
}

/** Head-to-head panel. The interesting question is rarely "is r/news negative?"
 *  but "how much more negative than somewhere else?" */
export function CompareView({ left, right }: { left: ComparisonSide; right: ComparisonSide }) {
  const gap = left.analysis.mean - right.analysis.mean;
  const happier = gap >= 0 ? left : right;
  const sadder = gap >= 0 ? right : left;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Side side={left} />
        <Side side={right} />
      </div>

      <p className="mt-4 rounded-lg bg-sunken px-3 py-2.5 text-xs leading-relaxed text-ink-2">
        <span className="font-medium text-ink">r/{happier.subreddit}</span> scores{' '}
        <span className="tnum font-medium text-ink">{Math.abs(gap).toFixed(2)}</span> higher than{' '}
        <span className="font-medium text-ink">r/{sadder.subreddit}</span>
        {Math.abs(gap) < 0.05
          ? ' — effectively a tie, well within the neutral band.'
          : Math.abs(gap) < 0.15
            ? ' — a modest difference in mood.'
            : ' — a substantial difference in mood.'}
      </p>

      <div className="mt-3">
        <Legend items={ORDER.map((label) => ({ color: LABEL_COLOR[label], name: LABEL_TEXT[label] }))} />
      </div>
    </div>
  );
}
