import type { Analysis } from '../lib/analysis';
import type { Label } from '../lib/sentiment';
import { percent } from '../lib/format';
import { Legend, LABEL_COLOR, LABEL_TEXT, MiniTable, TableFallback } from './primitives';

const ORDER: Label[] = ['positive', 'neutral', 'negative'];

/** Roughly how wide the "42%" label needs to be before it fits inside a segment. */
const LABEL_MIN_PERCENT = 9;

/**
 * One stacked bar of the three polarity shares.
 *
 * Segments are separated by a 2px gap in the surface color rather than a stroke —
 * a border would add ink that isn't data. Labels are only drawn inside a segment
 * that is actually wide enough for them; narrow segments defer to the legend.
 */
export function DistributionBar({ analysis }: { analysis: Analysis }) {
  const segments = ORDER.map((label) => ({
    label,
    share: analysis.shares[label],
    count: analysis.counts[label],
  })).filter((segment) => segment.count > 0);

  return (
    <div>
      <div className="flex h-11 w-full gap-[2px] overflow-hidden rounded-md">
        {segments.map(({ label, share, count }) => {
          const wideEnough = share * 100 >= LABEL_MIN_PERCENT;
          return (
            <div
              key={label}
              className="flex items-center justify-center transition-[flex-grow] duration-500"
              style={{ flexGrow: share, backgroundColor: LABEL_COLOR[label], flexBasis: 0 }}
              title={`${LABEL_TEXT[label]}: ${count} of ${analysis.posts.length}`}
            >
              {wideEnough && (
                // Set on a colored fill, so the label takes white rather than an
                // ink token — the one documented exception to "text never wears
                // the data color".
                <span className="tnum px-1 text-xs font-semibold text-white">{percent(share)}</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3">
        <Legend
          items={ORDER.map((label) => ({
            color: LABEL_COLOR[label],
            name: LABEL_TEXT[label],
            value: `${analysis.counts[label]} · ${percent(analysis.shares[label])}`,
          }))}
        />
      </div>

      <TableFallback>
        <MiniTable
          head={['Polarity', 'Posts', 'Share']}
          rows={ORDER.map((label) => [
            LABEL_TEXT[label],
            analysis.counts[label],
            percent(analysis.shares[label], 1),
          ])}
        />
      </TableFallback>
    </div>
  );
}
