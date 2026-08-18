import type { Label } from './sentiment';

/** The validated diverging palette, addressed by polarity rather than by hue. */
export const LABEL_COLOR: Record<Label, string> = {
  positive: 'var(--positive)',
  neutral: 'var(--neutral)',
  negative: 'var(--negative)',
};

export const LABEL_TEXT: Record<Label, string> = {
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'Negative',
};
