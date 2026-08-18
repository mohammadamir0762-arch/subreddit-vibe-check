import type { Analysis } from '../lib/analysis';
import { useMeasure } from '../lib/useMeasure';
import { ChartFrame, LABEL_COLOR, LABEL_TEXT, MiniTable, TableFallback, useChartTooltip } from './primitives';

const HEIGHT = 200;
const PAD = { top: 18, right: 8, bottom: 30, left: 30 };
const MAX_BAR = 24;
const GAP = 2;

/** Rounded at the data end, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.min(r, w / 2, h);
  if (h <= 0) return '';
  return [
    `M${x},${y + h}`,
    `V${y + radius}`,
    `A${radius},${radius} 0 0 1 ${x + radius},${y}`,
    `H${x + w - radius}`,
    `A${radius},${radius} 0 0 1 ${x + w},${y + radius}`,
    `V${y + h}`,
    'Z',
  ].join(' ');
}

/** Clean tick values — never 7 arbitrary decimals. */
function ticksFor(max: number): number[] {
  const step = max <= 4 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : 10;
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  return ticks;
}

/**
 * Distribution of individual title scores across ten bins.
 *
 * The stacked bar says how many posts are positive; this says *how* positive.
 * A subreddit whose scores pile up at the edges reads very differently from one
 * clustered at zero, and only this view distinguishes them.
 */
export function ScoreHistogram({ analysis }: { analysis: Analysis }) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const { tooltip, show, hide } = useChartTooltip();

  const plotWidth = Math.max(0, width - PAD.left - PAD.right);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const maxCount = Math.max(1, ...analysis.histogram.map((b) => b.count));
  const ticks = ticksFor(maxCount);
  const axisMax = ticks[ticks.length - 1] || 1;

  const slot = plotWidth / analysis.histogram.length;
  const barWidth = Math.max(1, Math.min(MAX_BAR, slot - GAP));
  const peak = analysis.histogram.reduce((a, b) => (b.count > a.count ? b : a), analysis.histogram[0]);

  return (
    <div ref={ref}>
      <ChartFrame tooltip={tooltip}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label="Distribution of title sentiment scores">
            {ticks.map((tick) => {
              const y = PAD.top + plotHeight - (tick / axisMax) * plotHeight;
              return (
                <g key={tick}>
                  <line
                    x1={PAD.left} x2={width - PAD.right} y1={y} y2={y}
                    stroke="var(--grid)" strokeWidth={1} shapeRendering="crispEdges"
                  />
                  <text x={PAD.left - 8} y={y + 4} textAnchor="end" className="tnum" fontSize={10} fill="var(--text-muted)">
                    {tick}
                  </text>
                </g>
              );
            })}

            {analysis.histogram.map((bin, i) => {
              const height = (bin.count / axisMax) * plotHeight;
              const x = PAD.left + i * slot + (slot - barWidth) / 2;
              const y = PAD.top + plotHeight - height;
              const isPeak = bin === peak && bin.count > 0;

              return (
                <g key={i}>
                  {bin.count > 0 && (
                    <path d={barPath(x, y, barWidth, height, 4)} fill={LABEL_COLOR[bin.label]} />
                  )}
                  {/* Hit target spans the full slot and full height, so thin bars
                      are still easy to hover. */}
                  <rect
                    x={PAD.left + i * slot} y={PAD.top} width={slot} height={plotHeight}
                    fill="transparent"
                    onMouseEnter={() =>
                      show(PAD.left + i * slot + slot / 2, y, (
                        <>
                          <div className="font-medium">{bin.count} {bin.count === 1 ? 'post' : 'posts'}</div>
                          <div className="tnum text-ink-3">
                            score {bin.from.toFixed(1)} to {bin.to.toFixed(1)} · {LABEL_TEXT[bin.label]}
                          </div>
                        </>
                      ))
                    }
                    onMouseLeave={hide}
                  />
                  {isPeak && (
                    <text
                      x={x + barWidth / 2} y={y - 6} textAnchor="middle"
                      className="tnum" fontSize={10} fontWeight={600} fill="var(--text-secondary)"
                    >
                      {bin.count}
                    </text>
                  )}
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
                y={HEIGHT - 10}
                textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
                className="tnum" fontSize={10} fill="var(--text-muted)"
              >
                {label}
              </text>
            ))}
          </svg>
        )}
      </ChartFrame>

      <p className="mt-1 text-xs text-ink-3">Sentiment score →</p>

      <TableFallback>
        <MiniTable
          head={['Range', 'Polarity', 'Posts']}
          rows={analysis.histogram.map((bin) => [
            `${bin.from.toFixed(1)} to ${bin.to.toFixed(1)}`,
            LABEL_TEXT[bin.label],
            bin.count,
          ])}
        />
      </TableFallback>
    </div>
  );
}
