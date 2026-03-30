import { describe, expect, test } from "bun:test";

import { shouldAutoAnchorInvertedScrollViewport } from "@/app/dashboard/components/feed/useFeedListSurfaceState";

describe("shouldAutoAnchorInvertedScrollViewport", () => {
  test("keeps a short inverted feed bottom-anchored after interaction claims ownership", () => {
    expect(
      shouldAutoAnchorInvertedScrollViewport({
        expandedArticleKey: null,
        hasClaimedInvertedScrollOwnership: true,
        isInvertedScroll: true,
        isUnderfilledInvertedViewport: true,
      }),
    ).toBe(true);
  });

  test("releases bottom anchoring once an interacted inverted feed is scrollable", () => {
    expect(
      shouldAutoAnchorInvertedScrollViewport({
        expandedArticleKey: null,
        hasClaimedInvertedScrollOwnership: true,
        isInvertedScroll: true,
        isUnderfilledInvertedViewport: false,
      }),
    ).toBe(false);
  });

  test("never auto-anchors while an article remains expanded", () => {
    expect(
      shouldAutoAnchorInvertedScrollViewport({
        expandedArticleKey: "article-1",
        hasClaimedInvertedScrollOwnership: false,
        isInvertedScroll: true,
        isUnderfilledInvertedViewport: true,
      }),
    ).toBe(false);
  });
});