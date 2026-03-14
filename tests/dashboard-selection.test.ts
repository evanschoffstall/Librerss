import { describe, expect, mock, test } from "bun:test";

import { ALL_FEEDS_NODE_KEY } from "@/app/dashboard/constants";
import { initializeDashboardSelection } from "@/app/dashboard/services/selection";
import { type CategoryTreeNode } from "@/lib";

/** Creates a promise whose resolution can be controlled by the test. */
function createDeferredPromise() {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve() {
      resolvePromise?.();
    },
  };
}

describe("initializeDashboardSelection", () => {
  test("releases sidebar loading after the initial feed fetch settles", async () => {
    const events: string[] = [];
    const deferredFetch = createDeferredPromise();
    const categories: CategoryTreeNode[] = [];

    const promise = initializeDashboardSelection({
      fetchAllFeeds: mock(async () => {
        events.push("fetch:start");
        await deferredFetch.promise;
        events.push("fetch:done");
      }),
      fetchCategoryFeeds: mock(async () => {}),
      fetchFeed: mock(async () => {}),
      loadFeedSources: mock(async () => {
        events.push("sources:done");
        return categories;
      }),
      selectedCategory: ALL_FEEDS_NODE_KEY,
      setIsCategoriesLoading: mock((value: boolean) => {
        events.push(`sidebar:${String(value)}`);
      }),
      setSelectedCategory: mock(() => {}),
    });

    await Promise.resolve();
    expect(events).toEqual(["sources:done", "fetch:start"]);

    deferredFetch.resolve();
    await promise;

    expect(events).toEqual([
      "sources:done",
      "fetch:start",
      "fetch:done",
      "sidebar:false",
    ]);
  });
});
