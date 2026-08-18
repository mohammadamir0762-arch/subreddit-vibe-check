/**
 * `sentiment` exposes its language modules as untyped deep imports. We need the
 * English one to build the Reddit-augmented language without mutating the base
 * AFINN dictionary — see the note in `lib/sentiment.ts`.
 */
declare module 'sentiment/languages/en/index.js' {
  const language: {
    labels: Record<string, number>;
    scoringStrategy?: {
      apply(tokens: string[], cursor: number, tokenScore: number): number;
    };
  };
  export default language;
}
