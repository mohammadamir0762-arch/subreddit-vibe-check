import type { Analysis, WordDriver } from '../lib/analysis';
import { signed } from '../lib/format';
import { useMeasure } from '../lib/useMeasure';
import { ChartFrame, LABEL_COLOR, MiniTable, TableFallback, useChartTooltip } from './primitives';

const ROW = 22;
const BAR = 14;
const LABEL_GUTTER = 8;

/**
 * The words actually moving the score, as a diverging bar chart around zero.
 *
 * This is the accountability view: it turns "r/news scored −0.31" into "because
 * of 'killed', 'attack', 'crisis'". Bars are ranked by *total* contribution
 * (weight x frequency) rather than raw frequency, so a single savage word
 * outranks a mild one used twice.
 */
export function WordDrivers({ analysis }: { analysis: Analysis }) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const { tooltip, show, hide } = useChartTooltip();

  // Positives descend from the top; negatives continue downward, longest last —
  // the result is a symmetric wing around the zero axis.
  const rows: WordDriver[] = [...analysis.drivers.positive, ...[...analysis.drivers.negative].reverse()];

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-ink-3">
        No sentiment-bearing words found. These titles are almost entirely neutral vocabulary.
      </p>
    );
  }

  const height = rows.length * ROW + 24;
  const centre = width / 2;
  const maxTotal = Math.max(...rows.map((r) => Math.abs(r.total)), 0.001);
  // Leave room for the word label that sits outside each bar's tip.
  const armWidth = Math.max(10, centre - 76);

  return (
    <div ref={ref}>
      <ChartFrame tooltip={tooltip}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label="Words driving the sentiment score">
            <line
              x1={centre} x2={centre} y1={4} y2={height - 20}
              stroke="var(--axis)" strokeWidth={1} shapeRendering="crispEdges"
            />

            {rows.map((driver, i) => {
              const positive = driver.total > 0;
              const length = (Math.abs(driver.total) / maxTotal) * armWidth;
              const y = 6 + i * ROW;
              const x = positive ? centre : centre - length;
              const color = positive ? LABEL_COLOR.positive : LABEL_COLOR.negative;

              return (
                <g key={driver.word}>
                  <rect
                    x={x} y={y} width={length} height={BAR}
                    fill={color}
                    // Round only the data end; the baseline end stays square.
                    rx={4}
                  />
                  {/* Square off the axis end by covering the inner corners. */}
                  <rect
                    x={positive ? centre : centre - 4} y={y} width={4} height={BAR} fill={color}
                  />
                  <text
                    x={positive ? centre + length + LABEL_GUTTER : centre - length - LABEL_GUTTER}
                    y={y + BAR - 3}
                    textAnchor={positive ? 'start' : 'end'}
                    fontSize={11}
                    fill="var(--text-secondary)"
                  >
                    {driver.word}
                  </text>
                  <rect
                    x={positive ? centre : 0} y={y - 3} width={centre} height={ROW} fill="transparent"
                    onMouseEnter={() =>
                      show(positive ? centre + length / 2 : centre - length / 2, y, (
                        <>
                          <div className="font-medium">{driver.word}</div>
                          <div className="tnum text-ink-3">
                            {driver.count} {driver.count === 1 ? 'title' : 'titles'} · total {signed(driver.total)}
                          </div>
                        </>
                      ))
                    }
                    onMouseLeave={hide}
                  />
                </g>
              );
            })}

            <text x={centre - 6} y={height - 6} textAnchor="end" fontSize={10} fill="var(--text-muted)">
              drags down
            </text>
            <text x={centre + 6} y={height - 6} textAnchor="start" fontSize={10} fill="var(--text-muted)">
              lifts up
            </text>
          </svg>
        )}
      </ChartFrame>

      <TableFallback>
        <MiniTable
          head={['Word', 'Titles', 'Total impact', 'Avg weight']}
          rows={rows.map((d) => [d.word, d.count, signed(d.total), signed(d.weight)])}
        />
      </TableFallback>
    </div>
  );
}
