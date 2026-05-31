import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";

import { MOBILE_UI_GROUPED_LAYOUT_STORAGE_KEY } from "@/app/dashboard/constants";

async function loadDashboardToolbar() {
  return import(
    `@/app/dashboard/components/DashboardToolbar?test=${Date.now()}-${Math.random()}`
  );
}

describe("DashboardToolbar mobile actions menu", () => {
  beforeEach(() => {
    mock.restore();
    window.localStorage.setItem(
      MOBILE_UI_GROUPED_LAYOUT_STORAGE_KEY,
      JSON.stringify(true),
    );
    mockDashboardToolbarState();
  });

  test("opens the menu when the three-dots trigger is clicked", async () => {
    const { DashboardToolbar } = await loadDashboardToolbar();
    const { getByLabelText, getByRole } = render(<DashboardToolbar />);

    await act(async () => {
      fireEvent.click(getByLabelText("Open actions menu"));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(getByRole("menuitem", { name: "Compact view" })).toBeTruthy();
      expect(getByRole("menuitem", { name: "Settings" })).toBeTruthy();
      expect(getByRole("menuitem", { name: "Sign out" })).toBeTruthy();
    });
  });
});

function mockDashboardToolbarState() {
  mock.module("@/app/dashboard/toolbar", () => ({
    useDashboardToolbarState: () => ({
      handleMarkAllRead: () => {},
      handleMarkViewportRead: () => {},
      handleOpenFeedsSidebar: () => {},
      handleOpenSettings: () => {},
      handleRefresh: () => {},
      handleRefreshFromUpstream: () => {},
      handleReset: async () => {},
      handleSearchChange: () => {},
      handleSignOut: async () => {},
      handleToggleTheme: () => {},
      isDark: true,
      isDevelopmentMode: true,
      isMarkingAllRead: false,
      isMarkingViewportRead: false,
      isRefreshing: false,
      isResetting: false,
      isSearchPending: false,
      isShellLoading: false,
      isSigningOut: false,
      mounted: true,
      search: "",
      themeToggleLabel: "Switch to light mode",
      title: "All Feeds",
    }),
  }));
  mock.module("@/components/ui/dropdown-menu", () => {
    const DropdownMenuContext = React.createContext<null | {
      open: boolean;
      setOpen: React.Dispatch<React.SetStateAction<boolean>>;
    }>(null);

    function DropdownMenu({ children }: { children: React.ReactNode }) {
      const [open, setOpen] = React.useState(false);
      return (
        <DropdownMenuContext.Provider value={{ open, setOpen }}>
          <div>{children}</div>
        </DropdownMenuContext.Provider>
      );
    }

    function DropdownMenuTrigger({
      asChild,
      children,
    }: {
      asChild?: boolean;
      children: React.ReactNode;
    }) {
      const context = React.useContext(DropdownMenuContext);
      if (!context) {
        throw new Error("DropdownMenuTrigger requires DropdownMenu context.");
      }

      const toggleMenu = () => {
        context.setOpen((current) => !current);
      };

      if (asChild && React.isValidElement(children)) {
        const existingOnClick = (
          children.props as { onClick?: (event: React.MouseEvent) => void }
        ).onClick;

        return React.cloneElement(
          children as React.ReactElement<{
            onClick?: (event: React.MouseEvent) => void;
          }>,
          {
            onClick: (event: React.MouseEvent) => {
              existingOnClick?.(event);
              toggleMenu();
            },
          },
        );
      }

      return (
        <button onClick={toggleMenu} type="button">
          {children}
        </button>
      );
    }

    function DropdownMenuContent({ children }: { children: React.ReactNode }) {
      const context = React.useContext(DropdownMenuContext);
      return context?.open ? <div role="menu">{children}</div> : null;
    }

    function DropdownMenuItem({
      children,
      disabled,
      onSelect,
    }: {
      children: React.ReactNode;
      disabled?: boolean;
      onSelect?: () => void;
    }) {
      return (
        <button
          disabled={disabled}
          onClick={onSelect}
          role="menuitem"
          type="button"
        >
          {children}
        </button>
      );
    }

    return {
      DropdownMenu,
      DropdownMenuContent,
      DropdownMenuItem,
      DropdownMenuSeparator: () => <hr />,
      DropdownMenuTrigger,
    };
  });
}
