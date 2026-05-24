import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test } from "bun:test";
import * as React from "react";

import { useFeedViewportState } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useFeedViewportState", () => {
  test("resolves the feed viewport after a StrictMode remount cycle", async () => {
    const viewport = document.createElement("div");
    viewport.dataset.radixScrollAreaViewport = "";

    const host = document.createElement("div");
    viewport.append(host);
    document.body.append(viewport);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <React.StrictMode>{children}</React.StrictMode>
    );

    const { result } = renderHook(
      () =>
        useFeedViewportState({
          feedViewKey: "system-all-feeds:all",
          isCollapseScrollRestoreActive: false,
          isInvertedScroll: false,
          refreshEpoch: 0,
        }),
      { wrapper },
    );

    act(() => {
      result.current.handleViewportHostRef(host as HTMLDivElement);
    });

    await waitFor(() => {
      expect(result.current.viewportResolutionState).toBe("ready");
      expect(result.current.scrollViewport).toBe(viewport);
    });
  });

  test("keeps the viewport host ref stable across same-input rerenders", () => {
    const { rerender, result } = renderHook(() =>
      useFeedViewportState({
        feedViewKey: "system-all-feeds:all",
        isCollapseScrollRestoreActive: false,
        isInvertedScroll: false,
        refreshEpoch: 0,
      }),
    );
    const initialHandleViewportHostRef = result.current.handleViewportHostRef;

    rerender();

    expect(result.current.handleViewportHostRef).toBe(
      initialHandleViewportHostRef,
    );
  });
});
