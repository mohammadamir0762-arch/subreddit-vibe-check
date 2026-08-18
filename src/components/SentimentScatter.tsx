import type { Analysis } from '../lib/analysis';
import { compact, describeCorrelation, signed } from '../lib/format';
import { useMeasure } from '../lib/useMeasure';
import { ChartFrame, LABEL_COLOR, LABEL_TEXT, Legend, MiniTable, TableFallback, useChartTooltip } from './primitives';

const HEIGHT = 260;
const PAD = { top: 16, right: 12, bottom: 34, left: 44 };
const RADIUS = 5;

/**
 * Sentiment against upvotes — the "does the mood actually pay?" view.
 *
 * Upvotes are plotted on a log scale because Reddit scores are severely
 * right-skewed: one 40k post next to forty 200-point posts would otherwise
 * flatten every other mark onto the axis and show nothing.
 */
export function SentimentScatter({ analysis }: { analysis: Analysis }) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const { tooltip, show, hide } = useChartTooltip();

  const plotWidth = Math.max(0, width - PAD.left - PAD.right);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;

  // log1p keeps zero-score posts on the chart instead of at negative infinity.
  const logScores = analysis.posts.map((p) => Math.log10(p.score + 1));
  const maxLog = Math.max(1, ...logScores);

  const xFor = (score: number) => PAD.left + ((score + 1) / 2) * plotWidth;
  const yFor = (logScore: number) => PAD.top + plotHeight - (logScore / maxLog) * plotHeight;

  const decades = Array.from({ length: Math.ceil(maxLog) + 1 }, (_, i) => i).filter((d) => d <= maxLog);

  return (
    <div ref={ref}>
      <ChartFrame tooltip={tooltip}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label="Title sentiment plotted against upvotes">
            {decades.map((decade) => {
              const y = yFor(decade);
              return (
                <g key={decade}>
                  <line
                    x1={PAD.left} x2={width - PAD.right} y1={y} y2={y}
                    stroke="var(--grid)" strokeWidth={1} shapeRendering="crispEdges"
                  />
                  <text x={PAD.left - 8} y={y + 4} textAnchor="end" className="tnum" fontSize={10} fill="var(--text-muted)">
                    {compact(10 ** decade - 1)}
                  </text>
                </g>
              );
            })}

            {/* Neutral axis — the reference every dot is read against. */}
            <line
              x1={xFor(0)} x2={xFor(0)} y1={PAD.top} y2={PAD.top + plotHeight}
              stroke="var(--axis)" strokeWidth={1} strokeDasharray="none" shapeRendering="crispEdges"
            />

            {analysis.posts.map((post, i) => {
              const cx = xFor(post.sentiment.score);
              const cy = yFor(logScores[i]);
              return (
                <g key={post.id}>
                  {/* 2px surface ring keeps overlapping dots readable. */}
                  <circle
                    cx={cx} cy={cy} r={RADIUS}
                    fill={LABEL_COLOR[post.sentiment.label]}
                    stroke="var(--surface)" strokeWidth={2}
                  />
                  <circle
                    cx={cx} cy={cy} r={RADIUS + 6} fill="transparent"
                    onMouseEnter={() =>
                      show(cx, cy - RADIUS, (
                        <>
                          <div className="line-clamp-3 font-medium">{post.title}</div>
                          <div className="tnum mt-1 text-ink-3">
                            {signed(post.sentiment.score)} · {compact(post.score)} upvotes
                          </div>
                        </>
                      ))
                    }
                    onMouseLeave={hide}
                  />
                </g>
              );
            })}

            <line
              x1={PAD.left} x2={width - PAD.right} y1={PAD.top + plotHeight} y2={PAD.top + plotHeight}
              stroke="var(--axis)" strokeWidth={1} shapeRendering="crispEdges"
            />

            {['−1.0', '0', '+1.0'].map((label, i) => (
              <text
                key={label}
                x={PAD.left + (plotWidth * i) / 2}
                y={HEIGHT - 14}
                textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
                className="tnum" fontSize={10} fill="var(--text-muted)"
              >
                {label}
              </text>
            ))}
          </svg>
        )}
      </ChartFrame>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <Legend
          items={(['positive', 'neutral', 'negative'] as const).map((label) => ({
            color: LABEL_COLOR[label],
            name: LABEL_TEXT[label],
          }))}
        />
        <p className="text-xs text-ink-3">Upvotes, log scale ↑ · sentiment →</p>
      </div>

      <p className="mt-3 rounded-lg bg-sunken px-3 py-2 text-xs leading-relaxed text-ink-2">
        <span className="font-medium text-ink">Spearman ρ = <span className="tnum">{analysis.correlation.toFixed(2)}</span></span>
        {' — '}
        {describeCorrelation(analysis.correlation)}
      </p>

      <TableFallback>
        <MiniTable
          head={['Title', 'Score', 'Upvotes']}
          rows={analysis.posts.map((post) => [
            <span className="line-clamp-1 max-w-[24rem]">{post.title}</span>,
            signed(post.sentiment.score),
            compact(post.score),
          ])}
        />
      </TableFallback>
    </div>
  );
}
