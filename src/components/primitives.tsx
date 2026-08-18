import type { ReactNode } from 'react';
import type { Label } from '../lib/sentiment';
import { LABEL_COLOR } from '../lib/labels';
import type { TooltipState } from '../lib/useChartTooltip';

export function Card({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-edge bg-surface p-5 shadow-[var(--shadow-card)] ${className}`}
    >
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * Identity is never carried by color alone — every chart with two or more series
 * ships this, and it pairs a swatch with a written name.
 */
export function Legend({ items }: { items: Array<{ color: string; name: string; value?: string }> }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <li key={item.name} className="flex items-center gap-1.5 text-xs text-ink-2">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-[2px]"
            style={{ backgroundColor: item.color }}
          />
          <span>{item.name}</span>
          {item.value && <span className="tnum text-ink-3">{item.value}</span>}
        </li>
      ))}
    </ul>
  );
}

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: Label | 'accent';
}) {
  const color = tone === 'accent' ? 'var(--accent)' : LABEL_COLOR[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        color,
        backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

export function ChartTooltip({ tooltip }: { tooltip: TooltipState | null }) {
  if (!tooltip) return null;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 max-w-[16rem] -translate-x-1/2 -translate-y-full rounded-lg border border-edge bg-raised px-2.5 py-1.5 text-xs leading-snug text-ink shadow-[var(--shadow-pop)]"
      style={{ left: tooltip.x, top: tooltip.y - 8 }}
    >
      {tooltip.content}
    </div>
  );
}

/** Wrapper that gives a chart a positioning context for its tooltip layer. */
export function ChartFrame({ children, tooltip }: { children: ReactNode; tooltip: TooltipState | null }) {
  return (
    <div className="relative">
      {children}
      <ChartTooltip tooltip={tooltip} />
    </div>
  );
}

/** Charts stay reachable without a mouse: every one is paired with a data table. */
export function TableFallback({ open, children }: { open?: boolean; children: ReactNode }) {
  return (
    <details className="mt-3 group" open={open}>
      <summary className="cursor-pointer list-none text-xs text-ink-3 transition-colors hover:text-ink-2">
        <span className="underline decoration-dotted underline-offset-2">View as table</span>
      </summary>
      <div className="mt-2 overflow-x-auto">{children}</div>
    </details>
  );
}

export function MiniTable({
  head,
  rows,
}: {
  head: string[];
  rows: Array<Array<ReactNode>>;
}) {
  return (
    <table className="w-full min-w-max border-collapse text-xs">
      <thead>
        <tr className="border-b border-edge text-left text-ink-3">
          {head.map((cell) => (
            <th key={cell} className="py-1.5 pr-4 font-medium">{cell}</th>
          ))}
        </tr>
      </thead>
      <tbody className="text-ink-2">
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-edge/60 last:border-0">
            {row.map((cell, j) => (
              <td key={j} className="tnum py-1.5 pr-4">{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
