import type { ApiError, HotResponse, SubredditSuggestion } from '../types';

export class RequestFailure extends Error {
  readonly hint?: string;
  readonly status?: number;

  constructor(message: string, hint?: string, status?: number) {
    super(message);
    this.name = 'RequestFailure';
    this.hint = hint;
    this.status = status;
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { signal });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new RequestFailure('Could not reach the server.', 'Check your network connection and try again.');
  }

  // An error body is JSON by contract, but a crashed function can return HTML.
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = payload as ApiError | null;
    throw new RequestFailure(
      detail?.error ?? `Request failed (HTTP ${response.status}).`,
      detail?.hint,
      response.status,
    );
  }
  return payload as T;
}

export function fetchHotPosts(subreddit: string, signal?: AbortSignal): Promise<HotResponse> {
  return getJson<HotResponse>(`/api/hot?subreddit=${encodeURIComponent(subreddit)}&limit=50`, signal);
}

export async function fetchSuggestions(query: string, signal?: AbortSignal): Promise<SubredditSuggestion[]> {
  const { results } = await getJson<{ results: SubredditSuggestion[] }>(
    `/api/search?q=${encodeURIComponent(query)}`,
    signal,
  );
  return results;
}
