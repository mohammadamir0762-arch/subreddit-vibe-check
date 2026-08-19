export interface RedditPost {
  id: string;
  title: string;
  author: string;
  /** Null when served from the RSS feed, which omits vote counts. */
  score: number | null;
  /** Null when served from the RSS feed, which omits comment counts. */
  numComments: number | null;
  createdUtc: number;
  permalink: string;
  url: string;
  flair: string | null;
  thumbnail: string | null;
  over18: boolean;
  stickied: boolean;
}

/** Which upstream served a listing: the JSON API, or the public Atom feed. */
export type PostSource = 'oauth' | 'rss' | 'snapshot';

export interface HotResponse {
  subreddit: string;
  posts: RedditPost[];
  authenticated: boolean;
  source: PostSource;
  /** When the bundled capture was taken. Null unless source is 'snapshot'. */
  capturedAt: string | null;
  fetchedAt: string;
}

export interface SubredditSuggestion {
  name: string;
  subscribers: number;
  over18: boolean;
  icon: string | null;
}

export interface ApiError {
  error: string;
  hint?: string;
  authenticated?: boolean;
}
