import { render } from "@testing-library/react";
import { expect, test } from "bun:test";
import { createRef } from "react";

import { PullToRefreshSentinel } from "@/app/dashboard/components/PullToRefreshSentinel";
import { FEED_PULL_HEIGHT } from "@/app/dashboard/hooks/useFeedSurface";

test("keeps the pull hint mounted while only toggling its visible state", () => {
  const sentinelRef = createRef<HTMLDivElement>();
  const { container, rerender } = render(
    <PullToRefreshSentinel
      isPulling={false}
      pullRefreshHint="Pull down to refresh"
      readyToRefresh={false}
      sentinelHeight={FEED_PULL_HEIGHT}
      sentinelRef={sentinelRef}
    />,
  );

  const sentinel = container.querySelector<HTMLElement>(
    "[data-dashboard-pull-sentinel='true']",
  );
  const idleHint = container.querySelector<HTMLElement>(
    "[data-dashboard-pull-hint='true']",
  );

  expect(sentinel).not.toBeNull();
  expect(sentinel?.dataset.dashboardPullState).toBe("idle");
  expect(idleHint).not.toBeNull();
  expect(idleHint?.style.visibility).toBe("hidden");

  rerender(
    <PullToRefreshSentinel
      isPulling={true}
      pullRefreshHint="Pull down to refresh"
      readyToRefresh={false}
      sentinelHeight={FEED_PULL_HEIGHT}
      sentinelRef={sentinelRef}
    />,
  );

  const activeHint = container.querySelector<HTMLElement>(
    "[data-dashboard-pull-hint='true']",
  );

  expect(container.querySelector("[data-dashboard-pull-hint='true']")).toBe(
    idleHint,
  );
  expect(activeHint).toBe(idleHint);
  expect(sentinel?.dataset.dashboardPullState).toBe("pulling");
  expect(activeHint?.style.visibility).toBe("visible");
});