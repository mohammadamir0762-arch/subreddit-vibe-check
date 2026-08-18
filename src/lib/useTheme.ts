import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'vibe-check-theme';

/**
 * Three-state theme control.
 *
 * "system" deliberately stamps *no* attribute, leaving the CSS
 * prefers-color-scheme block in charge. Only an explicit choice writes
 * data-theme, which is what lets the toggle override the OS in both directions.
 */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (choice === 'system') {
      root.removeAttribute('data-theme');
      localStorage.removeItem(STORAGE_KEY);
    } else {
      root.setAttribute('data-theme', choice);
      localStorage.setItem(STORAGE_KEY, choice);
    }
  }, [choice]);

  const cycle = useCallback(() => {
    setChoice((current) => (current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system'));
  }, []);

  return { choice, setChoice, cycle };
}
