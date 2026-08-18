/**
 * Starter subreddits, picked to span the sentiment range so the dashboard shows
 * something interesting on first load rather than a wall of neutral scores.
 */
export interface Preset {
  name: string;
  blurb: string;
}

export const PRESETS: Preset[] = [
  { name: 'UpliftingNews', blurb: 'Reliably positive' },
  { name: 'aww', blurb: 'Wholesome baseline' },
  { name: 'MadeMeSmile', blurb: 'Feel-good' },
  { name: 'science', blurb: 'Neutral and factual' },
  { name: 'AskReddit', blurb: 'Mixed bag' },
  { name: 'technology', blurb: 'Mildly critical' },
  { name: 'news', blurb: 'Usually grim' },
  { name: 'TrueOffMyChest', blurb: 'Heavily negative' },
];

/** Pairs worth comparing side by side in compare mode. */
export const COMPARE_SUGGESTIONS: Array<[string, string]> = [
  ['UpliftingNews', 'news'],
  ['aww', 'TrueOffMyChest'],
  ['science', 'conspiracy'],
];
