import type { Engine } from '../lib/sentiment';
import { ENGINE_META } from '../lib/sentiment';
import type { ThemeChoice } from '../lib/useTheme';

const ENGINES: Engine[] = ['vader', 'afinn'];

function Segmented<T extends string>({
  options, value, onChange, label,
}: {
  options: Array<{ key: T; name: string; title?: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="flex rounded-lg border border-edge bg-sunken p-0.5" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          title={option.title}
          onClick={() => onChange(option.key)}
          aria-pressed={value === option.key}
          className={`rounded-[6px] px-2.5 py-1 text-xs font-medium transition-colors ${
            value === option.key ? 'bg-surface text-ink shadow-[var(--shadow-card)]' : 'text-ink-3 hover:text-ink-2'
          }`}
        >
          {option.name}
        </button>
      ))}
    </div>
  );
}

const THEME_LABEL: Record<ThemeChoice, string> = { system: 'Auto', light: 'Light', dark: 'Dark' };

export function Controls({
  engine, onEngine, slang, onSlang, theme, onThemeCycle,
}: {
  engine: Engine;
  onEngine: (engine: Engine) => void;
  slang: boolean;
  onSlang: (slang: boolean) => void;
  theme: ThemeChoice;
  onThemeCycle: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        label="Sentiment engine"
        value={engine}
        onChange={onEngine}
        options={ENGINES.map((key) => ({
          key,
          name: ENGINE_META[key].name,
          title: ENGINE_META[key].blurb,
        }))}
      />

      {/* Only AFINN takes the supplementary lexicon; VADER already covers slang. */}
      {engine === 'afinn' && (
        <label
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-edge bg-surface px-2.5 py-1.5 text-xs text-ink-2"
          title="Adds a small Reddit-native lexicon (wholesome, cringe, based…) that AFINN has no entry for."
        >
          <input
            type="checkbox"
            checked={slang}
            onChange={(event) => onSlang(event.target.checked)}
            className="size-3.5 accent-[var(--accent)]"
          />
          Reddit slang
        </label>
      )}

      <button
        type="button"
        onClick={onThemeCycle}
        className="rounded-lg border border-edge bg-surface px-2.5 py-1.5 text-xs text-ink-2 transition-colors hover:text-ink"
        title="Cycle theme: auto → light → dark"
      >
        {THEME_LABEL[theme]}
      </button>
    </div>
  );
}
