/**
 * Aggregates per-title sentiment into the numbers the dashboard displays.
 * Pure functions over an already-analyzed post list — no I/O, no React.
 */

import type { RedditPost } from '../types';
import { analyzeTitle, labelFor, type Engine, type Label, type TitleSentiment } from './sentiment';

export interface AnalyzedPost extends RedditPost {
  sentiment: TitleSentiment;
}

export interface HistogramBin {
  /** Inclusive lower edge of the bin. */
  from: number;
  /** Exclusive upper edge (inclusive for the final bin). */
  to: number;
  count: number;
  label: Label;
}

export interface WordDriver {
  word: string;
  /** Number of titles the word appeared in. */
  count: number;
  /** Summed contribution across every title — impact, not just frequency. */
  total: number;
  weight: number;
}

export interface Verdict {
  title: string;
  description: string;
  polarity: Label;
}

export interface Analysis {
  posts: AnalyzedPost[];
  counts: Record<Label, number>;
  shares: Record<Label, number>;
  mean: number;
  median: number;
  /** Standard deviation of the score — how divided the room is. */
  spread: number;
  histogram: HistogramBin[];
  drivers: { positive: WordDriver[]; negative: WordDriver[] };
  mostPositive: AnalyzedPost[];
  mostNegative: AnalyzedPost[];
  /** True when the source supplied vote counts (JSON API, not the RSS feed). */
  hasScores: boolean;
  /** Spearman rank correlation between sentiment and upvotes, or null when the
   *  source did not supply vote counts. */
  correlation: number | null;
  verdict: Verdict;
}

export function analyzePosts(posts: RedditPost[], engine: Engine, useSlang: boolean): AnalyzedPost[] {
  return posts.map((post) => ({ ...post, sentiment: analyzeTitle(post.title, engine, useSlang) }));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - avg) ** 2)));
}

/**
 * Converts values to ranks, averaging ties. Used for Spearman correlation.
 */
function toRanks(values: number[]): number[] {
  const indexed = values.map((value, index) => ({ value, index }));
  indexed.sort((a, b) => a.value - b.value);

  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].value === indexed[i].value) j++;
    // Ties share the average of the ranks they span.
    const averageRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[indexed[k].index] = averageRank;
    i = j + 1;
  }
  return ranks;
}

/**
 * Spearman rank correlation between title sentiment and upvotes.
 *
 * Rank-based rather than Pearson on purpose: upvote counts are extremely
 * right-skewed (a couple of posts carry 100x the rest), and Pearson would let
 * those outliers dictate the coefficient. Ranks flatten that out.
 */
function spearman(a: number[], b: number[]): number {
  if (a.length < 3) return 0;
  const ra = toRanks(a);
  const rb = toRanks(b);
  const ma = mean(ra);
  const mb = mean(rb);

  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    const x = ra[i] - ma;
    const y = rb[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }

  const denom = Math.sqrt(da * db);
  return denom === 0 ? 0 : num / denom;
}

const BIN_COUNT = 10;

function buildHistogram(scores: number[]): HistogramBin[] {
  const width = 2 / BIN_COUNT;
  const bins: HistogramBin[] = Array.from({ length: BIN_COUNT }, (_, i) => {
    const from = -1 + i * width;
    const to = from + width;
    // Classify the bin by its midpoint so bin color matches the polarity it holds.
    return { from, to, count: 0, label: labelFor((from + to) / 2) };
  });

  for (const score of scores) {
    const clamped = Math.max(-1, Math.min(1, score));
    // The top edge belongs to the last bin rather than falling off the end.
    const index = Math.min(BIN_COUNT - 1, Math.floor((clamped + 1) / width));
    bins[index].count++;
  }
  return bins;
}

const DRIVER_LIMIT = 8;

function buildDrivers(posts: AnalyzedPost[]): Analysis['drivers'] {
  const totals = new Map<string, { count: number; total: number }>();

  for (const post of posts) {
    for (const { word, weight } of post.sentiment.words) {
      const entry = totals.get(word) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += weight;
      totals.set(word, entry);
    }
  }

  const all: WordDriver[] = [...totals.entries()].map(([word, { count, total }]) => ({
    word,
    count,
    total,
    weight: total / count,
  }));

  return {
    positive: all.filter((d) => d.total > 0).sort((a, b) => b.total - a.total).slice(0, DRIVER_LIMIT),
    negative: all.filter((d) => d.total < 0).sort((a, b) => a.total - b.total).slice(0, DRIVER_LIMIT),
  };
}

/** Maps the mean score onto plain-language verdicts. Thresholds are judgement
 *  calls, chosen so the middle band matches the engines' own neutral cutoff. */
function buildVerdict(mean: number, spread: number): Verdict {
  const divided = spread > 0.45;

  if (mean >= 0.3) {
    return { title: 'Radiant', description: 'Overwhelmingly upbeat. This is a feel-good corner of Reddit.', polarity: 'positive' };
  }
  if (mean >= 0.12) {
    return { title: 'Cheerful', description: 'Clearly positive on balance, with the odd complaint mixed in.', polarity: 'positive' };
  }
  if (mean >= 0.05) {
    return { title: 'Mildly upbeat', description: 'Leaning positive, but only just past the neutral band.', polarity: 'positive' };
  }
  if (mean > -0.05) {
    return {
      title: divided ? 'Polarised' : 'Even-keeled',
      description: divided
        ? 'The average lands near zero, but only because strong positives and negatives cancel out.'
        : 'Neutral and factual. Most titles carry little emotional charge at all.',
      polarity: 'neutral',
    };
  }
  if (mean > -0.12) {
    return { title: 'Mildly tense', description: 'Slightly negative overall — more griping than celebrating.', polarity: 'negative' };
  }
  if (mean > -0.3) {
    return { title: 'Heated', description: 'Distinctly negative. Frustration is the dominant register here.', polarity: 'negative' };
  }
  return { title: 'Volatile', description: 'Strongly negative across the board. Tread carefully.', polarity: 'negative' };
}

const EXTREME_LIMIT = 5;

export function buildAnalysis(posts: AnalyzedPost[]): Analysis {
  const scores = posts.map((p) => p.sentiment.score);

  const counts: Record<Label, number> = { positive: 0, neutral: 0, negative: 0 };
  for (const post of posts) counts[post.sentiment.label]++;

  const total = posts.length || 1;
  const shares: Record<Label, number> = {
    positive: counts.positive / total,
    neutral: counts.neutral / total,
    negative: counts.negative / total,
  };

  const upvotes = posts.map((post) => post.score);
  const hasScores = upvotes.every((value): value is number => value !== null);

  const byScore = [...posts].sort((a, b) => b.sentiment.score - a.sentiment.score);
  const avg = mean(scores);
  const spread = stdDev(scores);

  return {
    posts,
    counts,
    shares,
    mean: avg,
    median: median(scores),
    spread,
    histogram: buildHistogram(scores),
    drivers: buildDrivers(posts),
    mostPositive: byScore.filter((p) => p.sentiment.score > 0).slice(0, EXTREME_LIMIT),
    mostNegative: byScore.filter((p) => p.sentiment.score < 0).reverse().slice(0, EXTREME_LIMIT),
    hasScores,
    correlation: hasScores ? spearman(scores, upvotes as number[]) : null,
    verdict: buildVerdict(avg, spread),
  };
}
