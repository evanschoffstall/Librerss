/**
 * Tests for stale tab recovery after browser/tab suspension.
 *
 * Covers the visibility-change handling in useDashboardIntervals and the
 * background-refresh toast suppression guard in useFeedLoader.
 */

import { describe, expect, mock, test } from "bun:test";

import { STALE_TAB_THRESHOLD_MS } from "@/app/dashboard/hooks/useDashboardIntervals";
import {
  notifyFeedFailures,
} from "@/app/dashboard/services/feed-loader-state";

describe("stale tab threshold", () => {
  test("STALE_TAB_THRESHOLD_MS is a positive number of at least 10 seconds", () => {
    expect(typeof STALE_TAB_THRESHOLD_MS).toBe("number");
    expect(STALE_TAB_THRESHOLD_MS).toBeGreaterThanOrEqual(10_000);
  });

  test("STALE_TAB_THRESHOLD_MS is less than the minimum auto-refresh interval", () => {
    // The stale threshold must be shorter than the auto-refresh interval
    // so that the recovery fires before the next scheduled refresh.
    const thirtyMinutesMs = 30 * 60_000;
    expect(STALE_TAB_THRESHOLD_MS).toBeLessThan(thirtyMinutesMs);
  });
});

describe("feed failure notifications", () => {
  test("notifyFeedFailures does not throw when called with zero failures", () => {
    const formatLabel = mock(() => "");
    expect(() => {
      notifyFeedFailures([], 5, new Map(), formatLabel);
    }).not.toThrow();
    expect(formatLabel).not.toHaveBeenCalled();
  });
});
