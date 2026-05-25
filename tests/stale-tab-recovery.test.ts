/**
 * Tests for stale tab recovery after browser/tab suspension.
 *
 * Covers the visibility-change handling in useDashboardIntervals and the
 * background-refresh toast suppression guard in useFeedLoader.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { toast } from "sonner";

import { STALE_TAB_THRESHOLD_MS } from "@/app/dashboard/hooks/useDashboardIntervals";
import { FEED_LOADING_FAILSAFE_MS } from "@/app/dashboard/services/feed-data";
import {
  isFreshFeedBatchQuery,
  notifyFeedFailures,
  resolveFeedBatchStaleTime,
  shouldNotifyFeedFailureToast,
} from "@/app/dashboard/services/feed-loader-state";
import { BATCH_REQUEST_TIMEOUT_MS } from "@/lib/api/http";

const originalToastError = toast.error;
const originalToastWarning = toast.warning;

beforeEach(() => {
  toast.error = mock(() => "") as typeof toast.error;
  toast.warning = mock(() => "") as typeof toast.warning;
});

afterEach(() => {
  mock.restore();
  toast.error = originalToastError;
  toast.warning = originalToastWarning;
});

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

  test("feed loading failsafe stays above the batch HTTP timeout ceiling", () => {
    expect(FEED_LOADING_FAILSAFE_MS).toBeGreaterThan(BATCH_REQUEST_TIMEOUT_MS);
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

  test("notifyFeedFailures shows the full-outage error toast when every feed fails", () => {
    const formatLabel = mock(() => "unused");

    notifyFeedFailures(
      [{ ok: false, url: "https://example.com/a" }] as any,
      1,
      new Map(),
      formatLabel,
    );

    expect(toast.error).toHaveBeenCalledWith(
      "Unable to fetch feeds from upstream.",
      {
        description: "Try another feed or check back after the next refresh.",
      },
    );
    expect(formatLabel).not.toHaveBeenCalled();
  });

  test("notifyFeedFailures shows a partial-outage warning toast with the formatted label", () => {
    const formatLabel = mock(() => "Feed A, Feed B");
    const failedFeeds = [{ ok: false, url: "https://example.com/a" }] as any;
    const sourceNamesByUrl = new Map([["https://example.com/a", "Feed A"]]);

    notifyFeedFailures(failedFeeds, 3, sourceNamesByUrl, formatLabel);

    expect(formatLabel).toHaveBeenCalledWith(failedFeeds, sourceNamesByUrl);
    expect(toast.warning).toHaveBeenCalledWith("Some feeds failed to update", {
      description: "Feed A, Feed B",
    });
  });
});

describe("feed loader state helpers", () => {
  test("checks feed batch freshness against stale-time and query status", () => {
    const now = Date.now();
    const queryClient = {
      getQueryState: () => ({
        dataUpdatedAt: now - 500,
        status: "success",
      }),
    };

    expect(
      isFreshFeedBatchQuery(queryClient, ["feed-batch"] as any, 1_000),
    ).toBe(true);
    expect(isFreshFeedBatchQuery(queryClient, ["feed-batch"] as any, 0)).toBe(
      false,
    );
    expect(
      isFreshFeedBatchQuery(
        {
          getQueryState: () => ({ dataUpdatedAt: now, status: "error" }),
        },
        ["feed-batch"] as any,
        1_000,
      ),
    ).toBe(false);
  });

  test("resolves feed batch stale time by request source", () => {
    expect(resolveFeedBatchStaleTime({ forceRefresh: true } as any)).toBe(0);
    expect(resolveFeedBatchStaleTime({ skipRefresh: true } as any)).toBe(
      60_000,
    );
    expect(
      resolveFeedBatchStaleTime({ requestSource: "auto-refresh" } as any),
    ).toBe(0);
    expect(
      resolveFeedBatchStaleTime({ requestSource: "manual-refresh" } as any),
    ).toBe(0);
    expect(resolveFeedBatchStaleTime()).toBe(45_000);
  });

  test("suppresses foreground failure toasts only for background or skip-refresh work", () => {
    expect(shouldNotifyFeedFailureToast(undefined, false)).toBe(true);
    expect(
      shouldNotifyFeedFailureToast({ skipRefresh: true } as any, false),
    ).toBe(false);
    expect(shouldNotifyFeedFailureToast(undefined, true)).toBe(false);
  });
});
