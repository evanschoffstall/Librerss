export type DistillStrategy = "defuddle" | "librerss" | "readability";

export const DISTILL_STRATEGIES: readonly DistillStrategy[] = [
  "librerss",
  "readability",
  "defuddle",
] as const;

export interface DistilledArticle {
  content: string;
  description?: string;
  source?: string;
  title?: string;
}

export interface DistillOptions {
  contentLengthThreshold?: number;
}
