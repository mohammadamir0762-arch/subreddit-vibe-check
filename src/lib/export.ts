import type { Analysis } from './analysis';
import type { Engine } from './sentiment';

/** RFC 4180 quoting — titles routinely contain commas, quotes and newlines. */
function csvCell(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function download(filename: string, mime: string, contents: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: `${mime};charset=utf-8` }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can race the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

const COLUMNS = [
  'rank', 'title', 'author', 'sentiment_score', 'sentiment_label',
  'upvotes', 'comments', 'flair', 'permalink', 'driver_words',
] as const;

export function exportCsv(subreddit: string, engine: Engine, analysis: Analysis): void {
  const rows = analysis.posts.map((post, index) =>
    [
      index + 1,
      post.title,
      post.author,
      post.sentiment.score.toFixed(4),
      post.sentiment.label,
      post.score,
      post.numComments,
      post.flair ?? '',
      post.permalink,
      post.sentiment.words.map((w) => `${w.word}(${w.weight.toFixed(2)})`).join(' '),
    ].map(csvCell).join(','),
  );

  download(`${subreddit}-vibe-${engine}.csv`, 'text/csv', [COLUMNS.join(','), ...rows].join('\n'));
}

export function exportJson(subreddit: string, engine: Engine, analysis: Analysis): void {
  const payload = {
    subreddit,
    engine,
    generatedAt: new Date().toISOString(),
    summary: {
      verdict: analysis.verdict,
      mean: analysis.mean,
      median: analysis.median,
      spread: analysis.spread,
      counts: analysis.counts,
      sentimentUpvoteCorrelation: analysis.correlation,
    },
    drivers: analysis.drivers,
    posts: analysis.posts.map((post) => ({
      title: post.title,
      author: post.author,
      score: post.sentiment.score,
      label: post.sentiment.label,
      upvotes: post.score,
      comments: post.numComments,
      permalink: post.permalink,
      words: post.sentiment.words,
    })),
  };

  download(`${subreddit}-vibe-${engine}.json`, 'application/json', JSON.stringify(payload, null, 2));
}
