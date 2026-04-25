import { render } from "@testing-library/react";
import { describe, expect, test } from "bun:test";

import {
  DashboardToolbarMobileActions,
  DashboardToolbarMobileMenuButton,
} from "@/app/dashboard/dashboard-components/DashboardToolbarMobileActions";
import { DashboardToolbarSkeleton } from "@/app/dashboard/dashboard-components/DashboardToolbarSkeleton";

/** Creates a stable no-op callback for toolbar action style tests. */
function noop() {}

describe("dashboard toolbar mobile button styles", () => {
  test("reuses the uncondensed desktop icon treatment for mobile toolbar buttons", () => {
    const { getAllByLabelText, getByLabelText } = render(
      <>
        <DashboardToolbarMobileMenuButton handleOpenFeedsSidebar={noop} />
        <DashboardToolbarMobileActions
          handleMarkAllRead={noop}
          handleMarkViewportRead={noop}
          handleOpenSettings={noop}
          handleRefresh={noop}
          handleRefreshFromUpstream={noop}
          handleReset={async () => {}}
          handleSignOut={async () => {}}
          handleToggleTheme={noop}
          isDark={false}
          isDevelopmentMode={false}
          isMarkingAllRead={false}
          isRefreshing={false}
          isResetting={false}
          isSigningOut={false}
          isToolbarActionPending={false}
          mobileToolbarMirror={true}
          mounted={true}
          themeToggleLabel="Switch to dark mode"
        />
      </>,
    );

    const iconOnlyButtons = [
      getByLabelText("Open feeds"),
      getByLabelText("Open actions menu"),
      ...getAllByLabelText("Refresh selected feed"),
      ...getAllByLabelText("Mark fully visible articles as read"),
    ];

    for (const button of iconOnlyButtons) {
      expect(button.className).toContain("inline-flex");
      expect(button.className).toContain("shrink-0");
      expect(button.className).toContain("items-center");
      expect(button.className).toContain("justify-center");
      expect(button.className.includes("size-8")).toBe(false);
      expect(button.className.includes("size-9")).toBe(false);
      expect(button.className.includes("rounded-full")).toBe(false);
    }
  });

  test("reuses the desktop action skeleton footprint for mobile toolbar placeholders", () => {
    const { container } = render(
      <DashboardToolbarSkeleton
        isDevelopmentMode={false}
        mobileToolbarBottom={true}
        mobileToolbarMirror={true}
      />,
    );

    const mobileActionSkeletons = container.querySelectorAll<HTMLElement>(
      '[data-dashboard-toolbar-skeleton-mobile-actions="true"] [data-dashboard-toolbar-skeleton-action="true"]',
    );
    const mobileEdgeSkeleton = container.querySelector<HTMLElement>(
      '[data-dashboard-toolbar-skeleton-mobile-edge="true"]',
    );

    expect(mobileActionSkeletons).toHaveLength(3);
    expect(mobileEdgeSkeleton).toBeTruthy();

    for (const skeleton of [...mobileActionSkeletons, mobileEdgeSkeleton!]) {
      expect(skeleton.className).toContain("size-4");
      expect(skeleton.className).toContain("rounded-sm");
      expect(skeleton.className.includes("rounded-full")).toBe(false);
    }
  });
});
