import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';

export interface TooltipState {
  x: number;
  y: number;
  content: ReactNode;
}

/**
 * Hover state for a hand-rolled SVG chart. Coordinates are relative to the
 * chart's positioned wrapper, so the tooltip follows the mark without layout math.
 */
export function useChartTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const hide = useCallback(() => setTooltip(null), []);
  const show = useCallback((x: number, y: number, content: ReactNode) => {
    setTooltip({ x, y, content });
  }, []);
  return { tooltip, show, hide };
}
