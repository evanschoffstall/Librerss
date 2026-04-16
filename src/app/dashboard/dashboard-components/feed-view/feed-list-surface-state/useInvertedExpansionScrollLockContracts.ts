import type { InvertedExpansionViewportSnapshot } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";

export type InvertedExpansionScrollLockStarter = (
  articleKey: null | string,
  snapshot: InvertedExpansionViewportSnapshot | null,
  mode: "collapsing" | "expand" | "stable",
  releaseAt?: null | number,
) => void;

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

export type InvertedExpansionViewportSnapshotCapture = (
  articleKey: string,
) => InvertedExpansionViewportSnapshot | null;
