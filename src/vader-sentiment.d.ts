/**
 * `vader-sentiment` ships an untyped CommonJS bundle. This declares the single
 * surface we use rather than dropping the whole module to `any`.
 */
declare module 'vader-sentiment' {
  export interface PolarityScores {
    /** Proportion of the text falling in the negative bucket (0–1). */
    neg: number;
    /** Proportion of the text falling in the neutral bucket (0–1). */
    neu: number;
    /** Proportion of the text falling in the positive bucket (0–1). */
    pos: number;
    /** Normalized, weighted composite score in [-1, 1]. The headline number. */
    compound: number;
  }

  export const SentimentIntensityAnalyzer: {
    polarity_scores(input: string): PolarityScores;
  };
}
