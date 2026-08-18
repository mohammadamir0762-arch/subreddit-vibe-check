/**
 * Client-side sentiment analysis.
 *
 * Two engines, deliberately. They disagree in instructive ways on Reddit titles,
 * and being able to flip between them is the difference between "I called a
 * library" and "I understand what the library does":
 *
 *   AFINN-165 (`sentiment`) — a dictionary lookup. Sums per-word valences in
 *     [-5, 5] and applies a negation window. Fast, transparent, and it can show
 *     you exactly which words moved the score. Blind to caps, punctuation,
 *     emoji, and degree modifiers.
 *
 *   VADER (`vader-sentiment`) — a rule-augmented lexicon tuned specifically on
 *     social-media text. On top of the dictionary it models intensity boosters
 *     ("very"), ALL-CAPS emphasis, punctuation ("!!!"), contrastive conjunctions
 *     ("but"), degree modifiers and emoji. Better suited to Reddit titles, which
 *     is why it is the default here.
 *
 * Both run entirely in the browser, as the brief requires — no sentiment call
 * ever leaves the client.
 */

import Sentiment from 'sentiment';
import enLanguage from 'sentiment/languages/en/index.js';
import { SentimentIntensityAnalyzer } from 'vader-sentiment';

export type Engine = 'vader' | 'afinn';
export type Label = 'positive' | 'neutral' | 'negative';

export interface WordHit {
  word: string;
  /** Normalized to [-1, 1] so word weights are comparable across engines. */
  weight: number;
}

export interface TitleSentiment {
  /** Normalized polarity in [-1, 1]. Negative is negative. */
  score: number;
  label: Label;
  /** The sentiment-bearing words that produced the score, strongest first. */
  words: WordHit[];
}

/**
 * VADER's documented cutoff, reused for AFINN so both engines classify on the
 * same rule and the comparison stays honest.
 */
export const NEUTRAL_BAND = 0.05;

export function labelFor(score: number): Label {
  if (score >= NEUTRAL_BAND) return 'positive';
  if (score <= -NEUTRAL_BAND) return 'negative';
  return 'neutral';
}

/**
 * A small Reddit-native lexicon layered on top of AFINN.
 *
 * AFINN was built from general-purpose English and simply has no entry for the
 * vocabulary that actually carries sentiment on Reddit, so these titles score a
 * flat 0 without it. Kept deliberately small and conservative — ambiguous terms
 * are left out rather than guessed at.
 */
export const REDDIT_LEXICON: Record<string, number> = {
  wholesome: 3, based: 2, goated: 3, banger: 3, peak: 2, chef: 1,
  underrated: 2, masterpiece: 4, legend: 3, gem: 3, godsend: 4,
  cringe: -3, cursed: -2, mid: -1, ratio: -1, copium: -2, yikes: -2,
  clickbait: -2, karma: 0, shill: -2, astroturf: -2, doomer: -2,
  rant: -2, unpopular: -1, overrated: -2, scam: -4, bogus: -2,
  toxic: -3, gatekeeping: -2, tone: 0, sus: -1, brutal: -2,
};

const afinn = new Sentiment();

/**
 * The Reddit lexicon is installed as a registered *language* rather than through
 * `analyze`'s `extras` option.
 *
 * `extras` is a trap: internally it does `Object.assign(labels, extras)` on the
 * object returned by the library's module-level language cache, so the additions
 * leak permanently into the shared AFINN dictionary — across every Sentiment
 * instance in the process. Once any call passes extras, later calls that omit
 * them still score the slang, which would make the "Reddit slang" toggle appear
 * to do nothing after its first use.
 *
 * Registering a language instead keeps base AFINN pristine: the labels here are a
 * fresh copy, and switching is a matter of which language `analyze` is pointed at.
 * `scoringStrategy` is carried over deliberately — it implements AFINN's negation
 * window, and dropping it would stop "not good" from flipping sign.
 */
const REDDIT_LANGUAGE = 'en-reddit';

afinn.registerLanguage(REDDIT_LANGUAGE, {
  labels: { ...enLanguage.labels, ...REDDIT_LEXICON },
  scoringStrategy: enLanguage.scoringStrategy,
});

/** VADER reads caps and punctuation as intensity, so cleaning is deliberately
 *  minimal — only URLs, which carry no sentiment and pollute tokenization. */
function normalize(title: string): string {
  return title.replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim();
}

function analyzeAfinn(title: string, useSlang: boolean): TitleSentiment {
  // Base 'en' when the toggle is off; the augmented language when it is on.
  const result = afinn.analyze(normalize(title), useSlang ? { language: REDDIT_LANGUAGE } : undefined);

  // `calculation` is the per-word breakdown *after* negation handling, so a
  // flipped "not bad" shows up here with its corrected sign.
  const words: WordHit[] = result.calculation
    .map((entry) => {
      const [word, value] = Object.entries(entry)[0];
      return { word, weight: value / 5 };
    })
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

  // `comparative` is the score divided by token count, which keeps long and short
  // titles on the same footing. tanh squashes it into [-1, 1] without a hard clip
  // and is near-linear around zero, so the neutral band keeps its meaning.
  const score = Math.tanh(result.comparative);

  return { score, label: labelFor(score), words };
}

/** VADER returns only an aggregate, so per-word weights are recovered by scoring
 *  each token on its own. Approximate by construction — it can't show the
 *  contextual boosts — but enough to surface which words drove the result. */
function vaderWords(title: string): WordHit[] {
  const seen = new Set<string>();
  const hits: WordHit[] = [];

  for (const raw of title.split(/\s+/)) {
    const word = raw.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '');
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);

    const { compound } = SentimentIntensityAnalyzer.polarity_scores(word);
    if (compound !== 0) hits.push({ word: key, weight: compound });
  }

  return hits.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
}

function analyzeVader(title: string): TitleSentiment {
  const clean = normalize(title);
  const { compound } = SentimentIntensityAnalyzer.polarity_scores(clean);
  return { score: compound, label: labelFor(compound), words: vaderWords(clean) };
}

export function analyzeTitle(title: string, engine: Engine, useSlang: boolean): TitleSentiment {
  return engine === 'vader' ? analyzeVader(title) : analyzeAfinn(title, useSlang);
}

export const ENGINE_META: Record<Engine, { name: string; blurb: string }> = {
  vader: {
    name: 'VADER',
    blurb: 'Rule-augmented lexicon tuned for social media. Reads caps, punctuation, emoji and intensifiers.',
  },
  afinn: {
    name: 'AFINN-165',
    blurb: 'Classic dictionary lookup with a negation window. Transparent and fast, but ignores emphasis.',
  },
};
