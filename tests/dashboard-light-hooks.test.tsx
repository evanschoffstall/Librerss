import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { toast } from "sonner";

import type { Article } from "@/lib/core";

import { useDashboardArticleCallbacks } from "@/app/dashboard/dashboard-hooks/useDashboardArticleCallbacks";
import { useFeedLoadingTimeout } from "@/app/dashboard/dashboard-hooks/useFeedLoadingTimeout";
import { useRefreshStatus } from "@/app/dashboard/dashboard-hooks/useRefreshStatus";

const originalSetTimeout = window.setTimeout;
const originalClearTimeout = window.clearTimeout;
const originalToastError = toast.error;

beforeEach(() => {
  toast.error = mock(() => "") as typeof toast.error;
});

afterEach(() => {
  mock.restore();
  window.setTimeout = originalSetTimeout;
  window.clearTimeout = originalClearTimeout;
  toast.error = originalToastError;
});

describe("dashboard light hooks", () => {
  test("useDashboardArticleCallbacks exposes stable wrappers and feed view keys", async () => {
    const article = createArticle(1);
    const capturePreExpandSnapshot = mock(() => {});
    const handleArticleToggle = mock(() => {});
    const handleExpandedSwipeRead = mock(() => {});
    const handleSwipeRead = mock(async () => {});
    const handleToggleReadState = mock(async () => {});
    const handleToggleStarredState = mock(async () => {});

    const { result } = renderHook(() =>
      useDashboardArticleCallbacks({
        articleFilter: "starred",
        capturePreExpandSnapshot,
        handleArticleToggle,
        handleExpandedSwipeRead,
        handleSwipeRead,
        handleToggleReadState,
        handleToggleStarredState,
        selectedCategory: "feed-1",
      }),
    );

    expect(result.current.feedViewKey).toBe("feed-1:starred");

    act(() => {
      result.current.onArticlePrepareExpand(article);
      result.current.onArticleToggle(article);
      result.current.onArticleExpandedSwipeRead(article);
      result.current.onArticleSwipeRead(article);
      result.current.onArticleToggleRead(article);
      result.current.onArticleToggleStarred(article);
    });

    await waitFor(() => {
      expect(capturePreExpandSnapshot).toHaveBeenCalledWith(article);
      expect(handleArticleToggle).toHaveBeenCalledWith(article);
      expect(handleExpandedSwipeRead).toHaveBeenCalledWith(article);
      expect(handleSwipeRead).toHaveBeenCalledWith(article);
      expect(handleToggleReadState).toHaveBeenCalledWith(article);
      expect(handleToggleStarredState).toHaveBeenCalledWith(article);
    });
  });

  test("useFeedLoadingTimeout invokes the provided timeout handler and clears timers", async () => {
    let timeoutCallback: (() => void) | null = null;
    const clearTimeoutSpy = mock(() => {});
    const onTimeout = mock(() => {});
    const setLoading = mock(() => {});

    window.setTimeout = ((callback: TimerHandler) => {
      timeoutCallback = callback as () => void;
      return 1;
    }) as typeof window.setTimeout;
    window.clearTimeout = clearTimeoutSpy as typeof window.clearTimeout;

    const { rerender, unmount } = renderHook(
      ({ loading }) =>
        useFeedLoadingTimeout({
          loading,
          loadingEpoch: 2,
          onTimeout,
          setLoading,
          timeoutMs: 500,
        }),
      { initialProps: { loading: true } },
    );

    const callback = timeoutCallback as (() => void) | null;
    if (typeof callback === "function") {
      callback();
    }

    await waitFor(() => {
      expect(onTimeout).toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalled();
    });

    rerender({ loading: false });
    unmount();

    expect(setLoading).not.toHaveBeenCalled();
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  test("useFeedLoadingTimeout falls back to clearing loading when no timeout handler is provided", async () => {
    let timeoutCallback: (() => void) | null = null;
    const setLoading = mock(() => {});

    window.setTimeout = ((callback: TimerHandler) => {
      timeoutCallback = callback as () => void;
      return 1;
    }) as typeof window.setTimeout;

    renderHook(() =>
      useFeedLoadingTimeout({
        loading: true,
        loadingEpoch: 1,
        setLoading,
        timeoutMs: 500,
      }),
    );

    const callback = timeoutCallback as (() => void) | null;
    if (typeof callback === "function") {
      callback();
    }

    await waitFor(() => {
      expect(setLoading).toHaveBeenCalledWith(false);
    });
  });

  test("useRefreshStatus returns demo in preview mode and formats timestamps otherwise", () => {
    const { rerender, result } = renderHook(
      ({ usePlaceholderData }) => useRefreshStatus(usePlaceholderData),
      { initialProps: { usePlaceholderData: true } },
    );

    expect(result.current.lastRefreshLabel).toBe("demo");

    act(() => {
      result.current.setLastRefreshedAt(new Date());
      result.current.setRelativeRefreshTick((current) => current + 1);
    });

    rerender({ usePlaceholderData: false });

    expect(result.current.lastRefreshedAt).toBeInstanceOf(Date);
    expect(result.current.lastRefreshLabel).not.toBe("demo");
  });
});

function createArticle(id: number): Article {
  return {
    content: `Content ${id}`,
    feedId: 1,
    id,
    isRead: false,
    isStarred: false,
    lastChecked: new Date("2024-01-01T00:00:00.000Z"),
    link: `https://example.com/article-${id}`,
    publicationDate: new Date("2024-01-01T00:00:00.000Z"),
    title: `Article ${id}`,
  };
}
