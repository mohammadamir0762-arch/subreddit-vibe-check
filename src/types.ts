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

export interface HotResponse {
  subreddit: string;
  posts: RedditPost[];
  authenticated: boolean;
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
