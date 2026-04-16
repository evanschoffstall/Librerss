/**
 * Canonical distillation barrel.
 *
 * Keep this surface focused on the strategy-agnostic entry point and shared
 * contracts used by runtime code. Strategy-specific implementations stay on
 * their direct module paths to avoid redundant public exports.
 */
export { distillArticle } from "./distill";
export { DISTILL_STRATEGIES } from "./types";
export type { DistilledArticle, DistillStrategy } from "./types";
