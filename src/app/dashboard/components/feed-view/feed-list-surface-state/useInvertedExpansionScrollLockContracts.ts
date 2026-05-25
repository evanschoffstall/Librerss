import type { InvertedExpansionViewportSnapshot } from "@/app/dashboard/components/feed-view/feed-list-surface-state/view-core";

/**
 * Defines the inverted expansion scroll lock starter type.
 */
export type InvertedExpansionScrollLockStarter = (
  articleKey: null | string,
  snapshot: InvertedExpansionViewportSnapshot | null,
  mode: "collapsing" | "expand" | "stable",
  releaseAt?: null | number,
) => void;

/**
 * Describes the options for inverted expansion scroll lock transition.
 */
export interface InvertedExpansionScrollLockTransitionOptions {
  captureInvertedExpansionViewportSnapshot: InvertedExpansionViewportSnapshotCapture;
  invertedExpansionScrollLockRef: React.RefObject<unknown>;
  isInvertedScrollRef: React.RefObject<boolean>;
  onClaimInvertedScrollOwnership: () => void;
  scrollViewport: HTMLElement | null;
  startInvertedExpansionScrollLock: InvertedExpansionScrollLockStarter;
  syncInvertedExpansionScrollLock: () => void;
  viewportSnapshotRef: React.RefObject<InvertedExpansionViewportSnapshot | null>;
}

/**
 * Defines the inverted expansion viewport snapshot capture type.
 */
export type InvertedExpansionViewportSnapshotCapture = (
  articleKey: string,
) => InvertedExpansionViewportSnapshot | null;
