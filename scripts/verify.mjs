/**
 * Self-check for the two halves of the app.
 *
 * Run with `npm run verify`. It loads the *real* source modules through Vite's
 * SSR loader rather than reimplementing anything, so a green run means the
 * shipped code works — not that a copy of it does.
 *
 *   1. Sentiment pipeline — scored against hand-labelled fixture titles.
 *   2. Reddit credentials — a live call, skipped if .env is not configured.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer, loadEnv } from 'vite';

const C = { green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', dim: '\x1b[2m', off: '\x1b[0m' };
const PASS = `${C.green}PASS${C.off}`;
const FAIL = `${C.red}FAIL${C.off}`;
const SKIP = `${C.yellow}SKIP${C.off}`;

let failures = 0;

function check(name, condition, detail = '') {
  const suffix = detail ? ` ${C.dim}${detail}${C.off}` : '';
  console.log(`  ${condition ? PASS : FAIL}  ${name}${suffix}`);
  if (!condition) failures++;
}

/** Titles with an unambiguous expected polarity. */
const FIXTURES = [
  { title: 'Volunteers rescue stranded puppy, community celebrates wonderful outcome', want: 'positive' },
  { title: 'This is the best news I have heard all year, absolutely delighted', want: 'positive' },
  { title: 'Horrific attack kills dozens, families devastated by the tragedy', want: 'negative' },
  { title: 'Terrible service, complete scam, I hate this awful company', want: 'negative' },
  { title: 'Quarterly report published on Tuesday at the scheduled time', want: 'neutral' },
];

async function main() {
  const server = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });

  try {
    console.log('\nSentiment pipeline');
    const { analyzeTitle } = await server.ssrLoadModule('/src/lib/sentiment.ts');
    const { analyzePosts, buildAnalysis } = await server.ssrLoadModule('/src/lib/analysis.ts');

    for (const engine of ['vader', 'afinn']) {
      let correct = 0;
      const wrong = [];
      for (const fixture of FIXTURES) {
        const result = analyzeTitle(fixture.title, engine, true);
        if (result.label === fixture.want) correct++;
        else wrong.push(`want ${fixture.want}, got ${result.label} (${result.score.toFixed(2)})`);
      }
      check(`${engine} classifies fixture titles`, correct === FIXTURES.length,
        wrong.length ? wrong.join('; ') : `${correct}/${FIXTURES.length}`);
    }

    // Negation is the classic dictionary-lookup failure; both engines must handle it.
    for (const engine of ['vader', 'afinn']) {
      const plain = analyzeTitle('This is good', engine, true).score;
      const negated = analyzeTitle('This is not good', engine, true).score;
      check(`${engine} handles negation`, negated < plain,
        `${plain.toFixed(2)} -> ${negated.toFixed(2)}`);
    }

    // The Reddit lexicon should move a title AFINN alone scores at zero.
    const withoutSlang = analyzeTitle('Peak cringe, absolute copium', 'afinn', false).score;
    const withSlang = analyzeTitle('Peak cringe, absolute copium', 'afinn', true).score;
    check('reddit lexicon changes AFINN score', withoutSlang === 0 && withSlang < 0,
      `${withoutSlang.toFixed(2)} -> ${withSlang.toFixed(2)}`);

    // Regression guard. The `sentiment` library's `extras` option merges into a
    // module-level shared dictionary, so scoring *with* slang once used to leak
    // the additions into every later call and leave the toggle stuck on. Scoring
    // with slang and then without must return to the un-augmented score.
    analyzeTitle('Peak cringe, absolute copium', 'afinn', true);
    const afterToggleOff = analyzeTitle('Peak cringe, absolute copium', 'afinn', false).score;
    check('slang toggle is reversible', afterToggleOff === 0, afterToggleOff.toFixed(2));

    // Base AFINN must be untouched by the Reddit language registration.
    const baseline = analyzeTitle('Volunteers rescue stranded puppy', 'afinn', false).score;
    const augmented = analyzeTitle('Volunteers rescue stranded puppy', 'afinn', true).score;
    check('non-slang titles score identically either way', baseline === augmented,
      `${baseline.toFixed(3)} vs ${augmented.toFixed(3)}`);

    // Scores must stay inside the normalised range whatever the input.
    const extreme = analyzeTitle('AMAZING WONDERFUL PERFECT BEST GREATEST SUPERB!!!', 'vader', true).score;
    check('scores stay within [-1, 1]', extreme <= 1 && extreme >= -1, extreme.toFixed(3));

    console.log('\nAggregation');
    const posts = FIXTURES.map((fixture, i) => ({
      id: `t3_${i}`, title: fixture.title, author: 'tester',
      score: (i + 1) * 137, numComments: i * 9, createdUtc: Date.now() / 1000 - i * 3600,
      permalink: '', url: '', flair: null, thumbnail: null, over18: false, stickied: false,
    }));

    const analysis = buildAnalysis(analyzePosts(posts, 'vader', true));
    const counted = analysis.counts.positive + analysis.counts.neutral + analysis.counts.negative;

    check('every post is classified exactly once', counted === posts.length, `${counted}/${posts.length}`);
    check('histogram totals match post count',
      analysis.histogram.reduce((sum, bin) => sum + bin.count, 0) === posts.length);
    check('shares sum to 1',
      Math.abs(Object.values(analysis.shares).reduce((a, b) => a + b, 0) - 1) < 1e-9);
    check('correlation is finite and within [-1, 1]',
      Number.isFinite(analysis.correlation) && Math.abs(analysis.correlation) <= 1,
      analysis.correlation.toFixed(3));
    check('verdict is produced', typeof analysis.verdict.title === 'string' && analysis.verdict.title.length > 0,
      analysis.verdict.title);
    check('word drivers extracted',
      analysis.drivers.positive.length > 0 && analysis.drivers.negative.length > 0,
      `+${analysis.drivers.positive.length} / -${analysis.drivers.negative.length}`);

    // Guard against a bug that builds cleanly and only fails once deployed. This
    // package is "type": "module", so Vercel compiles api/ as ESM — and ESM does
    // not resolve extensionless relative specifiers. Omitting an extension throws
    // ERR_MODULE_NOT_FOUND at runtime, surfacing as FUNCTION_INVOCATION_FAILED.
    console.log('\nServerless bundle');
    const offenders = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!full.endsWith('.ts')) continue;
        for (const [, spec] of readFileSync(full, 'utf8').matchAll(/from\s+'(\.[^']*)'/g)) {
          if (!/\.(js|ts|json)$/.test(spec)) offenders.push(`${full} -> ${spec}`);
        }
      }
    };
    walk('api');
    check('api/ relative imports carry explicit extensions', offenders.length === 0,
      offenders.length ? offenders.join('; ') : 'ESM-resolvable');

    console.log('\nReddit API');
    const env = loadEnv('development', process.cwd(), '');
    for (const key of ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_USER_AGENT']) {
      if (env[key]) process.env[key] = env[key];
    }

    if (!process.env.REDDIT_CLIENT_ID) {
      console.log(`  ${SKIP}  live fetch ${C.dim}(no REDDIT_CLIENT_ID in .env - see README step 1)${C.off}`);
    } else {
      const { fetchHot } = await server.ssrLoadModule('/api/_lib/reddit.ts');
      try {
        const result = await fetchHot('UpliftingNews', 50);
        check('authenticated fetch returns posts', result.posts.length > 0, `${result.posts.length} posts`);
        check('running authenticated', result.authenticated === true);
        check('titles are non-empty', result.posts.every((p) => p.title.trim().length > 0));

        const live = buildAnalysis(analyzePosts(result.posts, 'vader', true));
        console.log(`  ${C.dim}-> r/UpliftingNews verdict: ${live.verdict.title} (mean ${live.mean.toFixed(3)})${C.off}`);
      } catch (error) {
        check('authenticated fetch returns posts', false, error.message);
        if (error.hint) console.log(`         ${C.dim}${error.hint}${C.off}`);
      }
    }
  } finally {
    await server.close();
  }

  const summary = failures === 0
    ? `${C.green}All checks passed.${C.off}`
    : `${C.red}${failures} check(s) failed.${C.off}`;
  console.log(`\n${summary}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
