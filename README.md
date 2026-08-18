# The Subreddit Vibe Check

Pulls the 50 current **Hot** posts from any subreddit and scores every title for
sentiment **in the browser**, then breaks the result down: an overall verdict, how
the scores are distributed, which words are responsible, and whether the mood
actually tracks with upvotes.

**Live:** _add your Vercel URL here_

---

## Quick start

```bash
npm install
cp .env.example .env      # then fill in the two Reddit values (see below)
npm run dev               # http://localhost:5173
npm run verify            # self-check: sentiment pipeline + live Reddit call
```

Reddit credentials are **required**, not optional — see the next section for why.

---

## The two constraints that shape this codebase

Most of the interesting decisions here follow from two facts about the Reddit API.

### 1. The browser cannot call Reddit directly

Two independent blockers, either one of which is fatal:

- **CORS.** Reddit sends no `Access-Control-Allow-Origin` header on its listing
  endpoints, so the browser blocks the response before your code sees it.
- **User-Agent.** Reddit requires a descriptive, unique `User-Agent` and throttles
  generic ones hard. `User-Agent` is a [forbidden header name][forbidden] in the
  Fetch spec — browser JavaScript is not permitted to set it at all.

So all Reddit traffic goes through a small server-side proxy: a Vercel serverless
function in production ([`api/hot.ts`](api/hot.ts)), and Vite middleware in local
dev ([`vite-plugins/dev-api.ts`](vite-plugins/dev-api.ts)). Both call the *same*
route functions in [`api/_lib/handlers.ts`](api/_lib/handlers.ts), so local and
production run identical code — "works locally, 500s in prod" can't happen. It
also keeps the OAuth secret off the client.

### 2. Anonymous server requests are blocked outright

The old advice — "just append `.json` to any Reddit URL" — no longer works from a
server. Verified while building this:

```
$ curl -o /dev/null -w "%{http_code}" https://www.reddit.com/r/UpliftingNews/hot.json
403
```

…and it returns a 403 **for every User-Agent**, including browser-like ones. The
response body is an HTML block page, not JSON.

The app therefore authenticates with Reddit's app-only OAuth flow. Without
credentials it fails fast with setup instructions rather than surfacing a
confusing 403 about the subreddit.

[forbidden]: https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name

---

## Getting Reddit API credentials

1. Sign in to Reddit and open <https://www.reddit.com/prefs/apps>.
2. **Create another app…** and fill in:
   - **name:** `vibe-check-dashboard` — note that Reddit rejects any OAuth app
     name containing the string "reddit", so `subreddit-vibe-check` will not be
     accepted. The name is only a label and need not match anything in the code.
   - **type:** **script**
   - **redirect uri:** `http://localhost:5173`
3. The **client ID** is the short string directly beneath the app name (not the
   name itself). The **secret** is the field labelled `secret`.
4. Put both in `.env`:

```ini
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_USER_AGENT=web:subreddit-vibe-check:1.0.0 (by /u/your_username)
```

Set the same three variables in Vercel under **Settings → Environment Variables**.
`npm run verify` will tell you whether they work.

---

## Sentiment analysis

Two engines, switchable at runtime. Both run entirely client-side, and because the
raw posts are already in memory, flipping engines **re-scores all 50 titles with no
network round-trip**.

| Engine | What it is | Trade-off |
|---|---|---|
| **VADER** (default) | Rule-augmented lexicon built for social media | Models ALL-CAPS, `!!!`, emoji, intensifiers and contrastive "but" — the things Reddit titles are full of |
| **AFINN-165** | Plain dictionary lookup, ±5 per word, with a negation window | Transparent and fast, but blind to emphasis |

Both are normalised to `[-1, +1]` and classified with VADER's documented ±0.05
neutral band, so the comparison between them is like-for-like.

### The Reddit lexicon

AFINN was built from general-purpose English and has no entry for the vocabulary
that actually carries sentiment on Reddit — `wholesome`, `cringe`, `based`,
`copium` all score a flat zero. A small supplementary lexicon
([`src/lib/sentiment.ts`](src/lib/sentiment.ts)) fills that gap, toggleable in the UI
so you can see its effect.

> **A bug worth documenting.** The obvious way to add words is `analyze`'s `extras`
> option. Don't. Internally it runs `Object.assign(labels, extras)` against the
> library's *module-level* language cache, so the additions leak permanently into
> the shared AFINN dictionary for every instance in the process — after one call
> with slang enabled, turning the toggle off silently kept scoring it. This is
> instead installed via `registerLanguage`, which takes a fresh copy of the labels
> and leaves base AFINN pristine. `npm run verify` guards the regression.

### What the numbers mean

- **Score** — mean title sentiment, `[-1, +1]`. The hero figure.
- **Divisiveness** — standard deviation. Separates "genuinely neutral" from
  "violently split, averaging to zero" — the verdict says *Polarised* rather than
  *Even-keeled* when it's high.
- **Word drivers** — ranked by weight × frequency, so one savage word outranks a
  mild one used twice.
- **Spearman ρ** — sentiment against upvotes. *Rank* correlation, because upvote
  counts are severely right-skewed and Pearson would let two viral posts dictate
  the coefficient. Plotted on a log scale for the same reason.

**Limitation, stated plainly:** titles are a thin signal. This measures headline
mood, not what people mean in the comments, and lexicon methods miss sarcasm —
which Reddit runs on.

---

## Design notes

Charts are hand-rolled SVG (no chart library) for exact control over mark specs
and a smaller bundle.

The palette is a **diverging blue ↔ red** pair with a gray midpoint. Green/red is
the obvious choice for sentiment and the wrong one — it is precisely the axis
red-green colourblind readers cannot separate. Every pairing was validated to
CVD ΔE ≥ 8 and normal-vision ΔE ≥ 15 against its own surface, in both themes:

| Role | Light | Dark |
|---|---|---|
| Positive | `#2a78d6` | `#3987e5` |
| Neutral | `#52514e` | `#c3c2b7` |
| Negative | `#e34948` | `#e66767` |

Colour never carries meaning alone: every chart ships a legend, direct labels
where they fit, and a "View as table" fallback. Dark mode is a selected set of
steps for the dark surface, not an inverted light palette, and respects both the
OS setting and an explicit toggle.

---

## Project layout

```
api/
  _lib/reddit.ts      Reddit client — OAuth, token cache, validation, error mapping
  _lib/handlers.ts    Transport-agnostic route logic (shared by prod + dev)
  hot.ts, search.ts   Vercel serverless entry points
vite-plugins/
  dev-api.ts          Mounts the same routes under `vite dev`
src/
  lib/sentiment.ts    Dual-engine scoring
  lib/analysis.ts     Aggregation: histogram, drivers, Spearman, verdict
  components/         Hand-rolled SVG charts + UI
scripts/verify.mjs    Self-check over the real modules
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server with the API routes mounted |
| `npm run build` | Typecheck + production build |
| `npm run verify` | Sentiment fixtures, aggregation invariants, live Reddit call |
| `npm run typecheck` | Types only |
| `npm run lint` | oxlint |

## Deploying to Vercel

1. Push to GitHub.
2. Import the repo at [vercel.com/new](https://vercel.com/new) — the Vite preset is
   detected automatically and `api/*.ts` become serverless functions.
3. Add `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` and `REDDIT_USER_AGENT` under
   **Settings → Environment Variables**, then redeploy.

## Notes on robustness

- Relative imports inside `api/` carry explicit `.js` extensions. This package is
  `"type": "module"`, so Vercel compiles the functions as ESM, and ESM does not
  resolve extensionless relative specifiers — omitting them builds cleanly and
  then fails at runtime with `FUNCTION_INVOCATION_FAILED`. `npm run verify`
  checks this statically, because it is invisible until deploy.

- Subreddit names are validated against `^[A-Za-z0-9_]{2,21}$` before being placed
  in a URL path, so input like `../../api/v1/me` can't steer the request at other
  Reddit endpoints using our credentials.
- The OAuth token is cached in module scope with a 60s expiry margin; warm
  serverless instances reuse it.
- Responses carry `s-maxage=300, stale-while-revalidate=600` so repeated loads hit
  Vercel's edge cache instead of Reddit's rate limit. Errors are `no-store`.
- Autocomplete requests are debounced and superseded requests aborted, so a fast
  typist can't race a stale response onto the screen.
- Results are reflected in the URL (`?r=subreddit`), so a view is shareable.
