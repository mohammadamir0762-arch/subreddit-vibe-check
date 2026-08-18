/** Compact counts: 987 / 12.4K / 3.1M. */
export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1_000) return String(Math.round(value));
  if (abs < 1_000_000) return `${(value / 1_000).toFixed(abs < 10_000 ? 1 : 0)}K`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

export function percent(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** Always-signed, fixed-precision score for display. */
export function signed(value: number, digits = 2): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}`;
}

export function relativeTime(unixSeconds: number): string {
  const seconds = Math.max(0, Date.now() / 1000 - unixSeconds);
  const units: Array<[number, string]> = [
    [60, 'm'],
    [3_600, 'h'],
    [86_400, 'd'],
  ];

  if (seconds < 60) return 'just now';
  if (seconds < 3_600) return `${Math.floor(seconds / units[0][0])}${units[0][1]} ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / units[1][0])}${units[1][1]} ago`;
  return `${Math.floor(seconds / units[2][0])}${units[2][1]} ago`;
}

/** Plain-language reading of a Spearman coefficient. */
export function describeCorrelation(rho: number): string {
  const abs = Math.abs(rho);
  const direction = rho > 0 ? 'happier titles get more upvotes' : 'angrier titles get more upvotes';
  if (abs < 0.1) return 'No meaningful link between sentiment and upvotes here.';
  if (abs < 0.3) return `A weak tendency — ${direction}.`;
  if (abs < 0.5) return `A moderate tendency — ${direction}.`;
  return `A strong tendency — ${direction}.`;
}
