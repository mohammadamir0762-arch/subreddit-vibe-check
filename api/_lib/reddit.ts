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
  score: number;
  numComments: number;
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

export interface HotResult {
  subreddit: string;
  posts: RedditPost[];
  authenticated: boolean;
  fetchedAt: string;
}

/** Fetches the top `limit` Hot posts for a subreddit. */
export async function fetchHot(rawName: string, limit = 50): Promise<HotResult> {
  const subreddit = assertValidSubreddit(rawName);
  const capped = Math.min(Math.max(Number(limit) || 50, 1), 100);

  const json = (await redditFetch(`/r/${subreddit}/hot`, {
    limit: String(capped),
  })) as { data?: { children?: RawChild[] } };

  const children = json?.data?.children ?? [];
  const posts = children.map(toPost).filter((p): p is RedditPost => p !== null);

  if (posts.length === 0) {
    throw new RedditError(404, `r/${subreddit} has no visible posts.`, 'It may be empty, banned, or fully private.');
  }

  return {
    subreddit,
    posts: posts.slice(0, capped),
    authenticated: isAuthenticated(),
    fetchedAt: new Date().toISOString(),
  };
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
