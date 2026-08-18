import type { Analysis } from '../lib/analysis';
import { percent, signed } from '../lib/format';

interface Tile {
  label: string;
  value: string;
  hint: string;
}

/** Figures that complement the hero rather than restating it. */
export function StatTiles({ analysis }: { analysis: Analysis }) {
  const strongest = analysis.posts.reduce(
    (best, post) => (Math.abs(post.sentiment.score) > Math.abs(best.sentiment.score) ? post : best),
    analysis.posts[0],
  );

  const tiles: Tile[] = [
    {
      label: 'Median score',
      value: signed(analysis.median),
      hint: 'Half the titles sit either side of this. Ignores outliers the mean chases.',
    },
    {
      label: 'Divisiveness',
      value: analysis.spread.toFixed(2),
      hint: analysis.spread > 0.45
        ? 'High — strong opinions in both directions.'
        : 'Low — titles cluster tightly around the average.',
    },
    {
      label: 'Neutral share',
      value: percent(analysis.shares.neutral),
      hint: 'Titles with no sentiment-bearing vocabulary at all.',
    },
    {
      label: 'Strongest title',
      value: signed(strongest.sentiment.score),
      hint: strongest.title,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-xl border border-edge bg-surface p-4 shadow-[var(--shadow-card)]">
          <p className="text-xs font-medium text-ink-3">{tile.label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">{tile.value}</p>
          <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-ink-3">{tile.hint}</p>
        </div>
      ))}
    </div>
  );
}
