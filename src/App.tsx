import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchHotPosts, RequestFailure } from './lib/api';
import { analyzePosts, buildAnalysis, type Analysis } from './lib/analysis';
import { ENGINE_META, type Engine } from './lib/sentiment';
import { exportCsv, exportJson } from './lib/export';
import { useTheme } from './lib/useTheme';
import type { HotResponse } from './types';

import { Card } from './components/primitives';
import { Controls } from './components/Controls';
import { SubredditSearch } from './components/SubredditSearch';
import { VerdictHero } from './components/VerdictHero';
import { StatTiles } from './components/StatTiles';
import { DistributionBar } from './components/DistributionBar';
import { ScoreHistogram } from './components/ScoreHistogram';
import { SentimentScatter } from './components/SentimentScatter';
import { WordDrivers } from './components/WordDrivers';
import { ExtremePosts } from './components/ExtremePosts';
import { PostList } from './components/PostList';
import { CompareView } from './components/CompareView';
import { EmptyState, ErrorState, LoadingState } from './components/States';

interface Failure {
  message: string;
  hint?: string;
}

/** Reads the subreddit out of the URL so a result can be linked or refreshed. */
function subredditFromUrl(): string {
  return new URLSearchParams(window.location.search).get('r') ?? '';
}

export default function App() {
  const [engine, setEngine] = useState<Engine>('vader');
  const [slang, setSlang] = useState(true);
  const theme = useTheme();

  const [data, setData] = useState<HotResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  // Remembered so a failed attempt stays retryable — the public feed's rate limit
  // is transient, and retrying is usually all it takes.
  const [lastAttempt, setLastAttempt] = useState('');

  const [compareOpen, setCompareOpen] = useState(false);
  const [rival, setRival] = useState<HotResponse | null>(null);
  const [rivalLoading, setRivalLoading] = useState(false);
  const [rivalFailure, setRivalFailure] = useState<Failure | null>(null);

  const toFailure = (error: unknown): Failure =>
    error instanceof RequestFailure
      ? { message: error.message, hint: error.hint }
      : { message: 'Something went wrong.', hint: 'Please try again in a moment.' };

  const load = useCallback(async (subreddit: string) => {
    setLoading(true);
    setFailure(null);
    setLastAttempt(subreddit);
    try {
      const response = await fetchHotPosts(subreddit);
      setData(response);
      // Keep the URL in step so results are shareable and survive a refresh.
      const url = new URL(window.location.href);
      url.searchParams.set('r', response.subreddit);
      window.history.replaceState(null, '', url);
    } catch (error) {
      setData(null);
      setFailure(toFailure(error));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRival = useCallback(async (subreddit: string) => {
    setRivalLoading(true);
    setRivalFailure(null);
    try {
      setRival(await fetchHotPosts(subreddit));
    } catch (error) {
      setRival(null);
      setRivalFailure(toFailure(error));
    } finally {
      setRivalLoading(false);
    }
  }, []);

  // Restore from a shared link on first paint.
  useEffect(() => {
    const initial = subredditFromUrl();
    if (initial) void load(initial);
  }, [load]);

  /**
   * Re-scoring runs here, not on the server. Because the raw posts are already in
   * memory, flipping the engine or the slang lexicon re-analyses all 50 titles
   * instantly with no network round-trip.
   */
  const analysis: Analysis | null = useMemo(
    () => (data ? buildAnalysis(analyzePosts(data.posts, engine, slang)) : null),
    [data, engine, slang],
  );

  const rivalAnalysis: Analysis | null = useMemo(
    () => (rival ? buildAnalysis(analyzePosts(rival.posts, engine, slang)) : null),
    [rival, engine, slang],
  );

  return (
    <div className="min-h-dvh bg-page">
      <header className="border-b border-edge bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-ink">
              The Subreddit Vibe Check
            </h1>
            <p className="text-xs text-ink-3">
              Sentiment analysis of the 50 current Hot posts, scored in your browser
            </p>
          </div>
          <Controls
            engine={engine}
            onEngine={setEngine}
            slang={slang}
            onSlang={setSlang}
            theme={theme.choice}
            onThemeCycle={theme.cycle}
          />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">
        <SubredditSearch onSubmit={load} loading={loading} initial={subredditFromUrl()} />

        {data?.source === 'rss' && (
          <p className="rounded-lg border border-edge bg-sunken px-3 py-2 text-xs leading-relaxed text-ink-2">
            <span className="font-medium text-ink">Live data via Reddit's public Atom feed.</span>{' '}
            Reddit blocks anonymous access to its JSON API, so these 50 posts come from{' '}
            <code className="text-ink">/r/{data.subreddit}/hot.rss</code> — the same Hot ranking, in the
            same order. That feed omits vote and comment counts, so the sentiment-vs-upvotes comparison
            is hidden rather than filled with invented numbers. Adding API credentials restores it.
          </p>
        )}

        {loading && <LoadingState />}
        {!loading && failure && (
          <ErrorState
            message={failure.message}
            hint={failure.hint}
            onRetry={lastAttempt ? () => void load(lastAttempt) : undefined}
          />
        )}
        {!loading && !failure && !analysis && <EmptyState />}

        {!loading && analysis && data && (
          <div className="space-y-4">
            <VerdictHero subreddit={data.subreddit} analysis={analysis} fetchedAt={data.fetchedAt} />

            <StatTiles analysis={analysis} />

            <div className="grid gap-4 lg:grid-cols-2">
              <Card
                title="Polarity split"
                subtitle={`How the 50 titles divide, using the ±0.05 neutral band both engines share.`}
              >
                <DistributionBar analysis={analysis} />
              </Card>

              <Card
                title="Score distribution"
                subtitle="Not just how many are positive, but how strongly."
              >
                <ScoreHistogram analysis={analysis} />
              </Card>
            </div>

            <div className={`grid gap-4 ${analysis.hasScores ? 'lg:grid-cols-2' : ''}`}>
              <Card
                title="What's driving the score"
                subtitle="Ranked by total impact — a word's weight times how often it appears."
              >
                <WordDrivers analysis={analysis} />
              </Card>

              {analysis.hasScores && (
                <Card
                  title="Does mood track with upvotes?"
                  subtitle="Each dot is one post. Upvotes use a log scale to keep outliers from flattening the rest."
                >
                  <SentimentScatter analysis={analysis} />
                </Card>
              )}
            </div>

            <Card title="The extremes">
              <ExtremePosts mostPositive={analysis.mostPositive} mostNegative={analysis.mostNegative} />
            </Card>

            <Card
              title="Compare with another subreddit"
              subtitle="Both sides are scored with the same engine, so the difference is real."
              action={
                <button
                  type="button"
                  onClick={() => setCompareOpen((open) => !open)}
                  className="rounded-lg border border-edge px-2.5 py-1 text-xs font-medium text-ink-2 transition-colors hover:text-ink"
                >
                  {compareOpen ? 'Hide' : 'Open'}
                </button>
              }
            >
              {compareOpen && (
                <div className="space-y-4">
                  <SubredditSearch onSubmit={loadRival} loading={rivalLoading} />
                  {rivalLoading && <div className="skeleton h-40 rounded-lg" />}
                  {rivalFailure && <ErrorState message={rivalFailure.message} hint={rivalFailure.hint} />}
                  {rivalAnalysis && rival && (
                    <CompareView
                      left={{ subreddit: data.subreddit, analysis }}
                      right={{ subreddit: rival.subreddit, analysis: rivalAnalysis }}
                    />
                  )}
                </div>
              )}
            </Card>

            <Card
              title={`All 50 posts`}
              subtitle="Every title, its score, and the words responsible."
              action={
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => exportCsv(data.subreddit, engine, analysis)}
                    className="rounded-lg border border-edge px-2.5 py-1 text-xs font-medium text-ink-2 transition-colors hover:text-ink"
                  >
                    CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => exportJson(data.subreddit, engine, analysis)}
                    className="rounded-lg border border-edge px-2.5 py-1 text-xs font-medium text-ink-2 transition-colors hover:text-ink"
                  >
                    JSON
                  </button>
                </div>
              }
            >
              <PostList posts={analysis.posts} hasScores={analysis.hasScores} />
            </Card>
          </div>
        )}

        <footer className="border-t border-edge pt-5 text-xs leading-relaxed text-ink-3">
          <p>
            <span className="font-medium text-ink-2">Method.</span> Titles are fetched through a
            server-side proxy (Reddit sends no CORS headers and requires a custom User-Agent that
            browsers are forbidden from setting) — via the JSON API when credentials are configured,
            otherwise the public Atom feed — then scored entirely client-side with{' '}
            <span className="text-ink-2">{ENGINE_META[engine].name}</span> — {ENGINE_META[engine].blurb}
          </p>
          <p className="mt-2">
            Scores are normalised to [−1, +1]; anything within ±0.05 counts as neutral. Titles are a
            thin signal — this reads headline mood, not what people mean in the comments.
          </p>
        </footer>
      </main>
    </div>
  );
}
