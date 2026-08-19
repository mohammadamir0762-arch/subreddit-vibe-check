/**
 * Transport-agnostic route logic.
 *
 * Both entry points — the Vercel serverless functions in `api/*.ts` and the Vite
 * dev middleware in `vite-plugins/dev-api.ts` — call into these. Keeping the logic
 * here (rather than in the handlers) means local dev and production run the exact
 * same code path, so "works locally, 500s on Vercel" can't happen.
 */

import { fetchHot, searchSubreddits, isAuthenticated, RedditError } from './reddit.js';

export interface RouteResult {
  status: number;
  body: unknown;
  cacheControl: string;
}

/** No caching for errors — a transient 429 must not be pinned to the edge. */
const NO_CACHE = 'no-store';

function toErrorResult(error: unknown): RouteResult {
  if (error instanceof RedditError) {
    return {
      status: error.status,
      body: { error: error.message, hint: error.hint, authenticated: isAuthenticated() },
      cacheControl: NO_CACHE,
    };
  }
  // Never leak an internal stack trace to the client.
  console.error('[api] unexpected failure', error);
  return {
    status: 500,
    body: { error: 'Unexpected server error while contacting Reddit.' },
    cacheControl: NO_CACHE,
  };
}

/** GET /api/hot?subreddit=<name>&limit=<n> */
export async function hotRoute(params: URLSearchParams): Promise<RouteResult> {
  try {
    const result = await fetchHot(params.get('subreddit') ?? '', Number(params.get('limit') ?? 50));
    return {
      status: 200,
      body: result,
      // Hot listings churn slowly, so a shared edge copy keeps us well clear of
      // Reddit's rate limit when several people load at once. A snapshot response
      // gets a much shorter TTL, so the edge goes back for live data soon rather
      // than pinning a fallback in place for five minutes.
      cacheControl:
        result.source === 'snapshot'
          ? 'public, s-maxage=45, stale-while-revalidate=120'
          : 'public, s-maxage=300, stale-while-revalidate=600',
    };
  } catch (error) {
    return toErrorResult(error);
  }
}

/** GET /api/search?q=<query> */
export async function searchRoute(params: URLSearchParams): Promise<RouteResult> {
  try {
    const results = await searchSubreddits(params.get('q') ?? '');
    return {
      status: 200,
      body: { results },
      cacheControl: 'public, s-maxage=3600, stale-while-revalidate=86400',
    };
  } catch (error) {
    return toErrorResult(error);
  }
}
