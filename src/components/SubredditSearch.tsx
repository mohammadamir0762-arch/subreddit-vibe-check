import { useEffect, useId, useRef, useState } from 'react';
import { fetchSuggestions } from '../lib/api';
import { compact } from '../lib/format';
import { PRESETS } from '../data/presets';
import type { SubredditSuggestion } from '../types';

const DEBOUNCE_MS = 220;

/**
 * Subreddit picker with typeahead.
 *
 * Suggestions come from Reddit's own autocomplete endpoint, so misspellings get
 * caught before they turn into a 404. Keystrokes are debounced and each in-flight
 * request is aborted when superseded, which keeps a fast typist from racing an
 * older response onto the screen.
 */
export function SubredditSearch({
  onSubmit,
  loading,
  initial = '',
}: {
  onSubmit: (subreddit: string) => void;
  loading: boolean;
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  const [suggestions, setSuggestions] = useState<SubredditSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchSuggestions(query, controller.signal)
        .then((results) => {
          setSuggestions(results);
          setHighlighted(-1);
        })
        .catch(() => {
          /* Autocomplete is a convenience — a failure must not block typing. */
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  // Dismiss the dropdown on an outside click.
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  function submit(name: string) {
    const clean = name.trim().replace(/^\/?r\//i, '');
    if (!clean) return;
    setValue(clean);
    setOpen(false);
    onSubmit(clean);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (event.key === 'Enter') submit(value);
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setHighlighted((index) => (index + 1) % suggestions.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setHighlighted((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
        break;
      case 'Enter':
        event.preventDefault();
        submit(highlighted >= 0 ? suggestions[highlighted].name : value);
        break;
      case 'Escape':
        setOpen(false);
        break;
    }
  }

  return (
    <div>
      <div ref={containerRef} className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-ink-3">
              r/
            </span>
            <input
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={onKeyDown}
              placeholder="Type a subreddit…"
              aria-label="Subreddit name"
              aria-autocomplete="list"
              aria-controls={listId}
              aria-expanded={open && suggestions.length > 0}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border border-edge bg-surface py-3 pl-8 pr-3 text-sm text-ink shadow-[var(--shadow-card)] transition-colors placeholder:text-ink-3 focus:border-accent focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => submit(value)}
            disabled={loading || value.trim().length < 2}
            className="shrink-0 rounded-xl px-5 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {loading ? 'Reading…' : 'Check vibe'}
          </button>
        </div>

        {open && suggestions.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-edge bg-raised py-1 shadow-[var(--shadow-pop)]"
          >
            {suggestions.map((suggestion, index) => (
              <li key={suggestion.name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === highlighted}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => submit(suggestion.name)}
                  className={`flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-sm transition-colors ${
                    index === highlighted ? 'bg-sunken text-ink' : 'text-ink-2'
                  }`}
                >
                  <span className="truncate">r/{suggestion.name}</span>
                  <span className="tnum shrink-0 text-xs text-ink-3">
                    {compact(suggestion.subscribers)} members
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-ink-3">Try:</span>
        {PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            onClick={() => submit(preset.name)}
            title={preset.blurb}
            className="rounded-full border border-edge bg-surface px-2.5 py-1 text-xs text-ink-2 transition-colors hover:border-edge-strong hover:text-ink"
          >
            r/{preset.name}
          </button>
        ))}
      </div>
    </div>
  );
}
