/**
 * Defines the distill strategy type.
 */
export type DistillStrategy = "defuddle" | "librerss" | "readability";

export const DISTILL_STRATEGIES: readonly DistillStrategy[] = [
  "librerss",
  "readability",
  "defuddle",
] as const;

/**
 * Describes the distilled article.
 */
export interface DistilledArticle {
  content: string;
  description?: string;
  source?: string;
  title?: string;
}

/**
 * Describes the options for distill.
 */
export interface DistillOptions {
  contentLengthThreshold?: number;
}
