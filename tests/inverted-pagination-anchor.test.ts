import { describe, expect, test } from "bun:test";

import { resolveSelectedAnchorSnapshot } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useInvertedPaginationAnchor";

describe("resolveSelectedAnchorSnapshot", () => {
  test("uses the pending snapshot at the inverted load boundary", () => {
    const snapshot = {
      anchorArticleKey: "article-2",
      anchorViewportOffsetTop: 160,
      scrollHeight: 1200,
      scrollTop: 0,
    };

    expect(
      resolveSelectedAnchorSnapshot({
        lastInvertedAwayBoundarySnapshotRef: { current: null },
        pendingInvertedPaginationAnchorSnapshotRef: { current: snapshot },
        scrollViewport: { scrollTop: 0 } as HTMLElement,
      }),
    ).toEqual(snapshot);
  });

  test("reuses the pending snapshot away from the inverted load boundary", () => {
    const snapshot = {
      anchorArticleKey: "article-2",
      anchorViewportOffsetTop: 160,
      scrollHeight: 1200,
      scrollTop: 552,
    };

    expect(
      resolveSelectedAnchorSnapshot({
        lastInvertedAwayBoundarySnapshotRef: { current: null },
        pendingInvertedPaginationAnchorSnapshotRef: { current: snapshot },
        scrollViewport: { scrollTop: 552 } as HTMLElement,
      }),
    ).toEqual(snapshot);
  });
});
