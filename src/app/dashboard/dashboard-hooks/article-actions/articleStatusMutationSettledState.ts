import type { Article } from "@/lib/core";

/**
 * Keep only article keys whose settled mutation still owns the latest local
 * state for that article. When a newer user action supersedes an in-flight
 * write, the older settlement must not restore or reapply stale status.
 * @param articleKeys - Article keys reported by the settled mutation.
 * @param shouldApplySettledUpdate - Optional ownership guard supplied by the caller.
 * @returns The subset of article keys still allowed to update the current feed.
 */
export function filterArticleKeysBySettledState(
  articleKeys: Set<string>,
  shouldApplySettledUpdate: ((articleKey: string) => boolean) | undefined,
) {
  return new Set(
    Array.from(articleKeys).filter((articleKey) =>
      shouldApplySettledArticleUpdate(articleKey, shouldApplySettledUpdate),
    ),
  );
}

/**
 * Keep only article entries whose settled mutation still owns their article key.
 * This lets success and failure settlement share the same stale-mutation guard
 * while preserving each article's original optimistic snapshot.
 * @param articleMap - Original article entries captured when the mutation began.
 * @param predicate - Ownership predicate for each article key.
 * @returns Article map narrowed to entries still owned by the settled mutation.
 */
export function filterArticleMapBySettledState(
  articleMap: Map<string, Article>,
  predicate: (articleKey: string) => boolean,
) {
  return new Map(
    Array.from(articleMap.entries()).filter(([articleKey]) =>
      predicate(articleKey),
    ),
  );
}

/**
 * Resolve whether a settled mutation is still allowed to touch the feed.
 * Mutations without an ownership guard are current by construction; guarded
 * mutations defer to the caller's latest-version tracker.
 * @param articleKey - Article key owned by the settled mutation.
 * @param shouldApplySettledUpdate - Optional caller-provided ownership guard.
 * @returns Whether the mutation may apply its success or failure state.
 */
export function shouldApplySettledArticleUpdate(
  articleKey: string,
  shouldApplySettledUpdate: ((articleKey: string) => boolean) | undefined,
) {
  return shouldApplySettledUpdate?.(articleKey) ?? true;
}
