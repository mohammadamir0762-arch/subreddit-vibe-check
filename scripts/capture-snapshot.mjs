/**
 * Captures the preset subreddits' Hot feeds into a bundled snapshot.
 *
 * Reddit's public Atom feed is rate-limited to roughly a handful of requests a
 * minute per IP. That is fine for one person browsing, but a reviewer clicking
 * through the presets in quick succession will hit 429s. This snapshot is the
 * floor: when a live fetch is throttled, the app serves these real, previously
 * captured posts instead of an error, labelled with their capture time.
 *
 * Run `npm run snapshot` to refresh. Deliberately slow — it spaces requests so
 * it does not trip the very limit it exists to work around.
 */

import { writeFileSync } from 'node:fs';

const PRESETS = [
  'UpliftingNews', 'aww', 'MadeMeSmile', 'science',
  'AskReddit', 'technology', 'news', 'TrueOffMyChest',
];

const UA = process.env.REDDIT_USER_AGENT
  || 'web:subreddit-vibe-check:1.0.0 (by /u/amir_vibecheck)';
const GAP_MS = 20_000;
const ATTEMPTS = 4;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function grab(subreddit) {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    for (const host of ['https://www.reddit.com', 'https://old.reddit.com']) {
      const res = await fetch(`${host}/r/${subreddit}/hot.rss?limit=50`, {
        headers: { 'User-Agent': UA, Accept: 'application/atom+xml' },
      });
      if (res.ok) return res.text();
      process.stdout.write(`    ${host.replace('https://', '')} -> ${res.status}\n`);
      await wait(5_000);
    }
    if (attempt < ATTEMPTS) {
      process.stdout.write(`    backing off ${GAP_MS / 1000}s (attempt ${attempt}/${ATTEMPTS})\n`);
      await wait(GAP_MS);
    }
  }
  return null;
}

const feeds = {};
for (const sub of PRESETS) {
  process.stdout.write(`  r/${sub}\n`);
  const xml = await grab(sub);
  if (xml) {
    feeds[sub.toLowerCase()] = xml;
    process.stdout.write(`    captured (${xml.length} bytes)\n`);
  } else {
    process.stdout.write(`    SKIPPED\n`);
  }
  await wait(GAP_MS);
}

writeFileSync(
  'api/_lib/snapshot.json',
  JSON.stringify({ capturedAt: new Date().toISOString(), feeds }, null, 0),
);
console.log(`\ncaptured ${Object.keys(feeds).length}/${PRESETS.length} presets`);
