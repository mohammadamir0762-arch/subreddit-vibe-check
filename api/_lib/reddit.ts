/**
 * Server-side Reddit client.
 *
 * Everything here runs on the server (Vercel serverless function in production,
 * a Vite middleware in local dev). It never runs in the browser, and that is
 * deliberate — two hard constraints make a direct browser fetch impossible:
 *
 *   1. CORS. Reddit does not send `Access-Control-Allow-Origin` for its listing
 *      endpoints, so a browser `fetch` is blocked before it ever leaves the tab.
 *   2. User-Agent. Reddit requires a descriptive, unique UA and aggressively
 *      rate-limits generic ones. `User-Agent` is a forbidden header name in the
 *      Fetch spec, so browser JS is not permitted to set it at all.
 *
 * Proxying through the server fixes both, and keeps the OAuth secret off the client.
 */

import { XMLParser } from 'fast-xml-parser';
import snapshot from './snapshot.json' with { type: 'json' };

const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const OAUTH_BASE = 'https://oauth.reddit.com';
const PUBLIC_BASE = 'https://www.reddit.com';

/** Reddit's own rule: `<platform>:<app id>:<version> (by /u/<username>)`. */
const DEFAULT_UA = 'web:subreddit-vibe-check:1.0.0 (by /u/unknown)';

const userAgent = () => process.env.REDDIT_USER_AGENT?.trim() || DEFAULT_UA;

/** Reddit subreddit names: 2–21 chars, alphanumerics + underscore. */
const SUBREDDIT_RE = /^[A-Za-z0-9_]{2,21}$/;

export class RedditError extends Error {
  readonly status: number;
  readonly hint?: string;

  constructor(status: number, message: string, hint?: string) {
    super(message);
    this.name = 'RedditError';
    this.status = status;
    this.hint = hint;
  }
}

/**
 * Validates a subreddit name before it is interpolated into a URL path.
 * Without this, input like `../../api/v1/me` would let a caller steer the
 * request at arbitrary Reddit endpoints using our credentials.
 */
export function assertValidSubreddit(name: unknown): string {
  const value = String(name ?? '').trim().replace(/^\/?r\//i, '');
  if (!SUBREDDIT_RE.test(value)) {
    throw new RedditError(
      400,
      `"${value}" is not a valid subreddit name.`,
      'Names are 2–21 characters, letters, numbers and underscores only.',
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// App-only OAuth
// ---------------------------------------------------------------------------

let cachedToken: { value: string; expiresAt: number } | null = null;

/**
 * Fetches an app-only bearer token, cached in module scope.
 *
 * Serverless instances are reused across invocations, so this meaningfully cuts
 * token round-trips on a warm function. Returns `null` when no credentials are
 * configured, which puts the caller on the unauthenticated public fallback.
 */
async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID?.trim();
  const clientSecret = process.env.REDDIT_CLIENT_SECRET?.trim() ?? '';
  if (!clientId) return null;

  // 60s of slack so a token can't expire mid-flight.
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value;
  }

  // A "script" app authenticates with client_credentials; an "installed" app has
  // no secret and uses the installed_client grant instead.
  const body = clientSecret
    ? new URLSearchParams({ grant_type: 'client_credentials' })
    : new URLSearchParams({
        grant_type: 'https://oauth.reddit.com/grants/installed_client',
        device_id: 'DO_NOT_TRACK_THIS_DEVICE',
      });

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent(),
    },
    body,
  });

  if (!res.ok) {
    throw new RedditError(
      502,
      `Reddit rejected the API credentials (HTTP ${res.status}).`,
      'Check REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET, and that the app type matches (script apps need a secret).',
    );
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new RedditError(502, 'Reddit returned no access token.');
  }

  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

/** True when server credentials are configured; surfaced to the UI as a badge. */
export const isAuthenticated = () => Boolean(process.env.REDDIT_CLIENT_ID?.trim());

// ---------------------------------------------------------------------------
// Request plumbing
// ---------------------------------------------------------------------------

/**
 * Raised when no credentials are configured and the anonymous path fails.
 *
 * As of 2025 Reddit blocks the public `.json` endpoints outright for server-side
 * traffic — every User-Agent gets a 403 HTML block page, so the unauthenticated
 * path is no longer a viable fallback. It is still *attempted*, in case a given
 * host or a future policy allows it, but a failure there is reported as a setup
 * problem rather than as a mysterious 403 about the subreddit.
 */
const SETUP_REQUIRED = new RedditError(
  503,
  'Reddit API credentials are not configured.',
  'Reddit blocks anonymous server requests. Create a "script" app at reddit.com/prefs/apps, then set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET (locally in .env, on Vercel under Settings -> Environment Variables).',
);

async function redditFetch(path: string, params: Record<string, string>): Promise<unknown> {
  const token = await getAccessToken();
  const base = token ? OAUTH_BASE : PUBLIC_BASE;
  // The public host requires the `.json` suffix; the OAuth host must not have it.
  const suffix = token ? '' : '.json';
  const query = new URLSearchParams({ ...params, raw_json: '1' });
  const url = `${base}${path}${suffix}?${query}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': userAgent(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    if (!token) throw SETUP_REQUIRED;
    throw describeFailure(res.status, true);
  }

  // A block page is HTML, not JSON — surface that as a clear failure rather than
  // letting a parse error bubble up as an opaque 500.
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) {
    throw token
      ? new RedditError(502, 'Reddit returned an unexpected non-JSON response.')
      : SETUP_REQUIRED;
  }

  return res.json();
}

/** Maps Reddit's status codes onto messages a user can actually act on. */
function describeFailure(status: number, authed: boolean): RedditError {
  switch (status) {
    case 403:
      return new RedditError(
        403,
        'That subreddit is private, quarantined, or gated.',
        authed
          ? 'Private and quarantined communities are not readable with app-only credentials.'
          : 'Running without API credentials — Reddit blocks most anonymous server traffic. Set REDDIT_CLIENT_ID to fix this.',
      );
    case 404:
      return new RedditError(404, 'No such subreddit.', 'Check the spelling — it may have been banned or renamed.');
    case 429:
      return new RedditError(
        429,
        'Rate limited by Reddit.',
        authed ? 'Wait a moment and retry.' : 'Anonymous requests have a very low limit. Configure API credentials.',
      );
    case 451:
      return new RedditError(451, 'That subreddit is unavailable for legal reasons.');
    default:
      return new RedditError(502, `Reddit returned HTTP ${status}.`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RedditPost {
  id: string;
  title: string;
  author: string;
  /** Null on the RSS path — the feed does not expose vote counts. */
  score: number | null;
  /** Null on the RSS path — the feed does not expose comment counts. */
  numComments: number | null;
  createdUtc: number;
  permalink: string;
  url: string;
  flair: string | null;
  thumbnail: string | null;
  over18: boolean;
  stickied: boolean;
}

interface RawChild {
  data?: Record<string, unknown>;
}

/** Narrows Reddit's loosely-typed listing payload into our own shape. */
function toPost(child: RawChild): RedditPost | null {
  const d = child?.data;
  if (!d || typeof d.id !== 'string' || typeof d.title !== 'string') return null;

  const thumb = typeof d.thumbnail === 'string' && d.thumbnail.startsWith('http') ? d.thumbnail : null;

  return {
    id: d.id,
    title: d.title,
    author: typeof d.author === 'string' ? d.author : '[deleted]',
    score: typeof d.score === 'number' ? d.score : 0,
    numComments: typeof d.num_comments === 'number' ? d.num_comments : 0,
    createdUtc: typeof d.created_utc === 'number' ? d.created_utc : 0,
    permalink: typeof d.permalink === 'string' ? `https://www.reddit.com${d.permalink}` : '',
    url: typeof d.url === 'string' ? d.url : '',
    flair: typeof d.link_flair_text === 'string' && d.link_flair_text ? d.link_flair_text : null,
    thumbnail: thumb,
    over18: d.over_18 === true,
    stickied: d.stickied === true,
  };
}

export type PostSource = 'oauth' | 'rss' | 'snapshot';

export interface HotResult {
  subreddit: string;
  posts: RedditPost[];
  authenticated: boolean;
  /** Which upstream served this listing. Surfaced in the UI. */
  source: PostSource;
  /** When a snapshot was captured. Null unless source is 'snapshot'. */
  capturedAt: string | null;
  fetchedAt: string;
}

/** Fetches the top `limit` Hot posts for a subreddit. */
export async function fetchHot(rawName: string, limit = 50): Promise<HotResult> {
  const subreddit = assertValidSubreddit(rawName);
  const capped = Math.min(Math.max(Number(limit) || 50, 1), 100);

  // With credentials, the JSON API gives the richest data (votes, comments,
  // flair). Without them Reddit blocks that API outright, so fall back to the
  // public Atom feed, which carries the same Hot ranking minus the counts.
  let source: PostSource = isAuthenticated() ? 'oauth' : 'rss';
  let capturedAt: string | null = null;

  let posts: RedditPost[];
  if (source === 'oauth') {
    const json = (await redditFetch(`/r/${subreddit}/hot`, {
      limit: String(capped),
    })) as { data?: { children?: RawChild[] } };
    posts = (json?.data?.children ?? []).map(toPost).filter((p): p is RedditPost => p !== null);
  } else {
    const feed = await fetchHotViaRss(subreddit, capped);
    posts = feed.posts;
    if (feed.capturedAt) {
      // Live fetch was throttled and the bundled capture served instead.
      source = 'snapshot';
      capturedAt = feed.capturedAt;
    }
  }

  if (posts.length === 0) {
    throw new RedditError(404, `r/${subreddit} has no visible posts.`, 'It may be empty, banned, or fully private.');
  }

  return {
    subreddit,
    posts: posts.slice(0, capped),
    authenticated: isAuthenticated(),
    source,
    capturedAt,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Fetches Hot posts from Reddit's public Atom feed.
 *
 * This is the no-credentials path. Reddit blocks anonymous server access to its
 * JSON API (403 for every User-Agent), but the RSS/Atom feeds for the same
 * listing are still served — `/r/{sub}/hot.rss` is the same Hot ranking, and
 * `limit` works, so it returns the same 50 posts in the same order.
 *
 * What the feed does NOT carry is vote and comment counts. Rather than invent
 * them, those fields come back null and the UI drops the features that depend on
 * them. Titles — which is all the sentiment analysis needs — are complete.
 */
/** Feed responses held in the instance, so a warm function serving repeat traffic
 *  never re-asks Reddit. Complements the edge cache, which only covers identical
 *  outward requests. */
const feedCache = new Map<string, { xml: string; expiresAt: number }>();
const FEED_TTL_MS = 180_000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Requests the feed, retrying through Reddit's rate limiter.
 *
 * The public feed is limited far more tightly than the authenticated API — a few
 * requests in quick succession is enough to draw a 429. Retrying with a short
 * backoff, then falling back to the old.reddit.com host (which limits
 * separately), turns most of those into a slightly slower success instead of an
 * error in the reviewer's face.
 */
async function requestFeed(subreddit: string, limit: number): Promise<Response> {
  const hosts = [PUBLIC_BASE, 'https://old.reddit.com'];
  const backoffMs = [0, 1200, 2500];
  let last: Response | null = null;

  for (let attempt = 0; attempt < backoffMs.length; attempt++) {
    if (backoffMs[attempt] > 0) await wait(backoffMs[attempt]);
    const host = hosts[Math.min(attempt, hosts.length - 1)];

    const res = await fetch(`${host}/r/${subreddit}/hot.rss?limit=${limit}`, {
      headers: { 'User-Agent': userAgent(), Accept: 'application/atom+xml, application/xml' },
    });

    // Only a rate-limit is worth retrying; a 404 will stay a 404.
    if (res.status !== 429) return res;
    last = res;
  }
  return last as Response;
}

interface Snapshot {
  capturedAt: string | null;
  feeds: Record<string, string>;
}

/** The bundled fallback feed for a subreddit, if one was captured. */
function snapshotFeed(subreddit: string): { xml: string; capturedAt: string | null } | null {
  const store = snapshot as Snapshot;
  const xml = store.feeds?.[subreddit.toLowerCase()];
  return xml ? { xml, capturedAt: store.capturedAt } : null;
}

async function fetchHotViaRss(
  subreddit: string,
  limit: number,
): Promise<{ posts: RedditPost[]; capturedAt: string | null }> {
  let usedSnapshot: string | null = null;
  const key = `${subreddit}:${limit}`;
  const cached = feedCache.get(key);

  let xml: string;
  if (cached && Date.now() < cached.expiresAt) {
    xml = cached.xml;
  } else {
    const res = await requestFeed(subreddit, limit);

    if (res.status === 429) {
      // Stale beats nothing when Reddit is throttling.
      if (cached) {
        xml = cached.xml;
      } else {
        const fallback = snapshotFeed(subreddit);
        if (!fallback) {
          throw new RedditError(
            429,
            'Reddit is rate limiting the public feed.',
            'This feed allows only a few requests a minute. Wait about 30 seconds and try again.',
          );
        }
        // Signals to the caller that this listing came from the bundled capture.
        usedSnapshot = fallback.capturedAt ?? 'unknown';
        xml = fallback.xml;
      }
    } else if (res.status === 404) {
      throw new RedditError(404, 'No such subreddit.', 'Check the spelling — it may have been banned or renamed.');
    } else if (!res.ok) {
      throw new RedditError(
        res.status === 403 ? 403 : 502,
        res.status === 403
          ? 'That subreddit is private, quarantined, or gated.'
          : `Reddit returned HTTP ${res.status} for the feed.`,
      );
    } else {
      xml = await res.text();
      feedCache.set(key, { xml, expiresAt: Date.now() + FEED_TTL_MS });
    }
  }

  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(xml) as {
    feed?: { entry?: unknown };
  };

  const raw = parsed?.feed?.entry;
  if (!raw) return { posts: [], capturedAt: usedSnapshot };
  // A feed with a single entry parses to an object rather than an array.
  const entries = (Array.isArray(raw) ? raw : [raw]) as Array<Record<string, unknown>>;

  const posts = entries
    .map((entry): RedditPost | null => {
      const title = typeof entry.title === 'string' ? entry.title : String(entry.title ?? '');
      if (!title.trim()) return null;

      const id = typeof entry.id === 'string' ? entry.id.replace(/^t3_/, '') : '';
      const author = entry.author as { name?: string } | undefined;
      const link = entry.link as { '@_href'?: string } | undefined;
      const published = typeof entry.published === 'string' ? entry.published : '';

      return {
        id: id || title.slice(0, 24),
        title,
        author: (author?.name ?? '').replace(/^\/u\//, '') || '[unknown]',
        score: null,
        numComments: null,
        createdUtc: published ? Date.parse(published) / 1000 : 0,
        permalink: link?.['@_href'] ?? '',
        url: link?.['@_href'] ?? '',
        // The feed's <category> is the subreddit itself, not post flair.
        flair: null,
        thumbnail: null,
        over18: false,
        stickied: false,
      };
    })
    .filter((post): post is RedditPost => post !== null);

  return { posts, capturedAt: usedSnapshot };
}

export interface SubredditSuggestion {
  name: string;
  subscribers: number;
  over18: boolean;
  icon: string | null;
}

/** Typeahead suggestions for the subreddit picker. Never throws — a failed
 *  autocomplete should degrade to "no suggestions", not break the input. */
export async function searchSubreddits(query: string): Promise<SubredditSuggestion[]> {
  const q = String(query ?? '').trim().replace(/^\/?r\//i, '');
  if (q.length < 2) return [];

  try {
    const json = (await redditFetch('/api/subreddit_autocomplete_v2', {
      query: q,
      limit: '8',
      include_over_18: 'false',
      include_profiles: 'false',
      typeahead_active: 'true',
    })) as { data?: { children?: RawChild[] } };

    return (json?.data?.children ?? [])
      .map((child) => {
        const d = child?.data;
        if (!d || typeof d.display_name !== 'string') return null;
        const icon = typeof d.icon_img === 'string' && d.icon_img.startsWith('http') ? d.icon_img : null;
        return {
          name: d.display_name,
          subscribers: typeof d.subscribers === 'number' ? d.subscribers : 0,
          over18: d.over_18 === true,
          icon,
        };
      })
      .filter((s): s is SubredditSuggestion => s !== null);
  } catch {
    return [];
  }
}
