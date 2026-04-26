"use client";

import { Search } from "lucide-react";

import { DashboardToolbarSkeleton } from "@/app/dashboard/dashboard-components";
import { DashboardToolbarDesktopActions } from "@/app/dashboard/dashboard-components/DashboardToolbarDesktopActions";
import {
  DashboardToolbarMobileActions,
  DashboardToolbarMobileMenuButton,
} from "@/app/dashboard/dashboard-components/DashboardToolbarMobileActions";
import { MotionSpinner } from "@/app/dashboard/dashboard-components/status";
import { MOBILE_UI_GROUPED_LAYOUT_STORAGE_KEY } from "@/app/dashboard/dashboard-services/dashboard-constants";
import { useDashboardToolbarState } from "@/app/dashboard/toolbar";
import { Input } from "@/components/ui/input";
import { useLocalStorage } from "@/lib/hooks";

/**
 * Describes the props for the dashboard toolbar content component.
 */
interface DashboardToolbarContentProps {
  toolbar: ReturnType<typeof useDashboardToolbarPresentationState>;
}

/**
 * Describes the props for the dashboard toolbar component.
 */
interface DashboardToolbarProps {
  /**
   * When supplied by a parent controller, this value overrides the event-based
   * shell-loading detection so the toolbar hydrates in the same React render
   * as the article list and filter bar.  Omit when the toolbar is used
   * standalone and must self-detect loading state from the event bus.
   */
  isShellLoading?: boolean;
  startInShellLoading?: boolean;
}
/**
 * Describes the props for the dashboard toolbar shell component.
 */
interface DashboardToolbarShellProps {
  children: React.ReactNode;
  mobileToolbarBottom: boolean;
  mobileToolbarMirror: boolean;
}

/**
 * Render the dashboard toolbar component.
 * @param props - The component props.
 * @returns The rendered dashboard toolbar component.
 */
export function DashboardToolbar(props: DashboardToolbarProps) {
  const {
    isShellLoading: controlledIsShellLoading,
    startInShellLoading = false,
  } = props;
  const toolbar = useDashboardToolbarPresentationState(
    startInShellLoading,
    controlledIsShellLoading,
  );

  if (toolbar.isShellLoading) {
    return (
      <DashboardToolbarSkeleton
        isDevelopmentMode={toolbar.isDevelopmentMode}
        mobileToolbarBottom={toolbar.mobileToolbarBottom}
        mobileToolbarMirror={toolbar.mobileToolbarMirror}
      />
    );
  }

  return <DashboardToolbarContent toolbar={toolbar} />;
}

/**
 * Render the dashboard toolbar content component.
 * @param props - The component props.
 * @returns The rendered dashboard toolbar content component.
 */
function DashboardToolbarContent(props: DashboardToolbarContentProps) {
  const { toolbar } = props;
  return (
    <DashboardToolbarShell
      mobileToolbarBottom={toolbar.mobileToolbarBottom}
      mobileToolbarMirror={toolbar.mobileToolbarMirror}
    >
      <DashboardToolbarMobileMenuButton
        handleOpenFeedsSidebar={toolbar.handleOpenFeedsSidebar}
      />
      <DashboardToolbarTitle title={toolbar.title} />
      <DashboardToolbarSearch
        handleSearchChange={toolbar.handleSearchChange}
        isSearchPending={toolbar.isSearchPending}
        search={toolbar.search}
      />
      <DashboardToolbarMobileActions
        handleMarkAllRead={toolbar.handleMarkAllRead}
        handleMarkViewportRead={toolbar.handleMarkViewportRead}
        handleOpenSettings={toolbar.handleOpenSettings}
        handleRefresh={toolbar.handleRefresh}
        handleRefreshFromUpstream={toolbar.handleRefreshFromUpstream}
        handleReset={toolbar.handleReset}
        handleSignOut={toolbar.handleSignOut}
        handleToggleTheme={toolbar.handleToggleTheme}
        isDark={toolbar.isDark}
        isDevelopmentMode={toolbar.isDevelopmentMode}
        isMarkingAllRead={toolbar.isMarkingAllRead}
        isRefreshing={toolbar.isRefreshing}
        isResetting={toolbar.isResetting}
        isSigningOut={toolbar.isSigningOut}
        isToolbarActionPending={toolbar.isToolbarActionPending}
        mobileToolbarMirror={toolbar.mobileToolbarMirror}
        mounted={toolbar.mounted}
        themeToggleLabel={toolbar.themeToggleLabel}
      />
      <DashboardToolbarDesktopActions
        handleMarkAllRead={toolbar.handleMarkAllRead}
        handleMarkViewportRead={toolbar.handleMarkViewportRead}
        handleOpenSettings={toolbar.handleOpenSettings}
        handleRefresh={toolbar.handleRefresh}
        handleRefreshFromUpstream={toolbar.handleRefreshFromUpstream}
        handleReset={toolbar.handleReset}
        handleSignOut={toolbar.handleSignOut}
        handleToggleTheme={toolbar.handleToggleTheme}
        isDark={toolbar.isDark}
        isDevelopmentMode={toolbar.isDevelopmentMode}
        isResetting={toolbar.isResetting}
        isSigningOut={toolbar.isSigningOut}
        isToolbarActionPending={toolbar.isToolbarActionPending}
        mounted={toolbar.mounted}
        themeToggleLabel={toolbar.themeToggleLabel}
      />
    </DashboardToolbarShell>
  );
} /**
 * Render the dashboard toolbar search component.
 * @param props - The component props.
 * @returns The rendered dashboard toolbar search component.
 */
function DashboardToolbarSearch(
  props: Pick<
    ReturnType<typeof useDashboardToolbarState>,
    "handleSearchChange" | "isSearchPending" | "search"
  >,
) {
  const { handleSearchChange, isSearchPending, search } = props;
  return (
    <div className="relative min-w-0 flex-1">
      {isSearchPending ? (
        <MotionSpinner
          className="
            pointer-events-none absolute top-1/2 left-3 -translate-y-1/2
          "
          iconClassName="size-3.5 text-muted-foreground/60"
        />
      ) : (
        <Search
          className="
            pointer-events-none absolute top-1/2 left-3 size-3.5
            -translate-y-1/2 text-muted-foreground/40
          "
        />
      )}
      <Input
        className={`
          h-9 border-transparent pl-9 text-sm
          focus-visible:bg-background
          ${isSearchPending ? `bg-muted/45` : `bg-muted/30`}
        `}
        onChange={(event) => {
          handleSearchChange(event.target.value);
        }}
        placeholder="Search..."
        value={search}
      />
    </div>
  );
}

/**
 * Render the dashboard toolbar shell component.
 * @param props - The component props.
 * @returns The rendered dashboard toolbar shell component.
 */
function DashboardToolbarShell(props: DashboardToolbarShellProps) {
  const { children, mobileToolbarBottom, mobileToolbarMirror } = props;
  return (
    <div
      className={
        mobileToolbarBottom
          ? `
            pointer-events-auto fixed inset-x-0 bottom-0 z-50 border-t
            border-border/50 bg-background/80 pb-[env(safe-area-inset-bottom)]
            backdrop-blur-md
            lg:top-0 lg:bottom-auto lg:border-t-0 lg:border-b lg:pb-0
          `
          : `
            pointer-events-auto fixed inset-x-0 top-0 z-50 border-b
            border-border/50 bg-background/80 backdrop-blur-md
          `
      }
      data-dashboard-toolbar="true"
      suppressHydrationWarning
    >
      <div
        className={`
          mx-auto flex h-14 max-w-6xl items-center gap-4 px-4
          pr-[max(1rem,env(safe-area-inset-right))]
          pl-[max(1rem,env(safe-area-inset-left))]
          md:px-6
          ${
            mobileToolbarMirror
              ? `
        flex-row-reverse
        lg:flex-row
      `
              : ""
          }
        `}
        suppressHydrationWarning
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Render the dashboard toolbar title component.
 * @param props - The component props.
 * @returns The rendered dashboard toolbar title component.
 */
function DashboardToolbarTitle(
  props: Pick<ReturnType<typeof useDashboardToolbarState>, "title">,
) {
  const { title } = props;
  return (
    <h1
      className="
        flex min-w-0 items-center gap-2 text-lg font-semibold tracking-tight
        select-none
      "
    >
      <img alt="LibreRSS logo" className="size-5" src="/favicon.svg" />
      <span className="truncate">{title}</span>
    </h1>
  );
}

/**
 * Manage the dashboard toolbar presentation state.
 * @param startInShellLoading - The start in shell loading.
 * @param controlledIsShellLoading - The controlled is shell loading.
 * @returns The dashboard toolbar presentation state state and callbacks.
 */
function useDashboardToolbarPresentationState(
  startInShellLoading: boolean,
  controlledIsShellLoading?: boolean,
) {
  const toolbarState = useDashboardToolbarState(
    startInShellLoading,
    controlledIsShellLoading,
  );
  const [mobileGroupedLayout] = useLocalStorage(
    MOBILE_UI_GROUPED_LAYOUT_STORAGE_KEY,
    true,
  );
  return {
    ...toolbarState,
    // Include isSearchPending so the refresh, mark-all-read, and visible
    // buttons show skeleton while a server search is resolving.  The search
    // bar itself is never disabled — only these action buttons reflect the
    // loading state, giving a live-search feel with targeted feedback.
    isToolbarActionPending:
      toolbarState.isRefreshing ||
      toolbarState.isMarkingAllRead ||
      toolbarState.isMarkingViewportRead ||
      toolbarState.isSearchPending,
    mobileToolbarBottom: mobileGroupedLayout,
    mobileToolbarMirror: mobileGroupedLayout,
  };
}
