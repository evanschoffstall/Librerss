export type DistillStrategy = "custom" | "readability" | "defuddle";

export const DISTILL_STRATEGIES: readonly DistillStrategy[] = [
  "custom",
  "readability",
  "defuddle",
] as const;

export interface DistilledArticle {
  content: string;
  title?: string;
  description?: string;
  source?: string;
}

export interface DistillOptions {
  contentLengthThreshold?: number;
}
