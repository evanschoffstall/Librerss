"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { DASHBOARD_EVENTS } from "@/app/dashboard/dashboard-services/dashboard-constants";

interface DashboardShellLoadingStateOptions {
  hasReceivedShellLoadingEvent: boolean;
  readyState: DocumentReadyState;
  shellLoadingFromDocument: boolean | null;
}

interface ShellLoadingEventDetail {
  loading?: boolean;
}

/**
 * Process the read dashboard shell loading from document.
 * @returns The read dashboard shell loading from document.
 */
export function readDashboardShellLoadingFromDocument() {
  const shellLoading = document.documentElement.dataset.dashboardShellLoading;

  if (shellLoading === "true") {
    return true;
  }

  if (shellLoading === "false") {
    return false;
  }

  return null;
}
/**
 * Process the read dashboard shell loading from event.
 * @param event - The incoming event.
 * @returns Whether read dashboard shell loading from event.
 */
export function readDashboardShellLoadingFromEvent(event: Event) {
  const detail = (event as CustomEvent<ShellLoadingEventDetail>).detail;

  return detail.loading === true;
}

/**
 * Resolve the dashboard shell loading state.
 * @param options - The options used to resolve the dashboard shell loading state.
 * @returns The dashboard shell loading state.
 */
export function resolveDashboardShellLoadingState(
  options: DashboardShellLoadingStateOptions,
) {
  const { hasReceivedShellLoadingEvent, readyState, shellLoadingFromDocument } =
    options;
  if (shellLoadingFromDocument !== null) {
    return shellLoadingFromDocument;
  }

  if (!hasReceivedShellLoadingEvent && readyState === "complete") {
    return false;
  }

  return null;
}

/**
 * Manage the dashboard shell loading state.
 * @param startInShellLoading - The start in shell loading.
 * @returns Whether dashboard shell loading state.
 */
export function useDashboardShellLoadingState(startInShellLoading: boolean) {
  const hasReceivedShellLoadingEventRef = useRef(false);
  const [isShellLoading, setIsShellLoading] = useState(startInShellLoading);

  useLayoutEffect(() => {
    /**
     * Process the sync shell loading from document.
     * @returns Whether sync shell loading from document.
     */
    const syncShellLoadingFromDocument = () => {
      const shellLoading = readDashboardShellLoadingFromDocument();

      if (shellLoading === null) {
        return false;
      }

      hasReceivedShellLoadingEventRef.current = true;
      setIsShellLoading(shellLoading);
      return true;
    };

    /**
     * Process the settle optimistic shell loading.
     */
    const settleOptimisticShellLoading = () => {
      const shellLoading = resolveDashboardShellLoadingState({
        hasReceivedShellLoadingEvent: hasReceivedShellLoadingEventRef.current,
        readyState: document.readyState,
        shellLoadingFromDocument: readDashboardShellLoadingFromDocument(),
      });

      if (shellLoading !== null) {
        hasReceivedShellLoadingEventRef.current = true;
        setIsShellLoading(shellLoading);
      }
    };

    /**
     * Process the handle shell loading.
     * @param event - The incoming event.
     */
    const handleShellLoading = (event: Event) => {
      hasReceivedShellLoadingEventRef.current = true;
      setIsShellLoading(readDashboardShellLoadingFromEvent(event));
    };

    /**
     * Process the handle ready state change.
     */
    const handleReadyStateChange = () => {
      settleOptimisticShellLoading();
    };

    window.addEventListener(
      DASHBOARD_EVENTS.SHELL_LOADING,
      handleShellLoading as EventListener,
    );

    const shellLoadingObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            syncShellLoadingFromDocument();
          });

    shellLoadingObserver?.observe(document.documentElement, {
      attributeFilter: ["data-dashboard-shell-loading"],
      attributes: true,
    });

    syncShellLoadingFromDocument();
    document.addEventListener("readystatechange", handleReadyStateChange);
    queueMicrotask(settleOptimisticShellLoading);

    return () => {
      window.removeEventListener(
        DASHBOARD_EVENTS.SHELL_LOADING,
        handleShellLoading as EventListener,
      );
      shellLoadingObserver?.disconnect();
      document.removeEventListener("readystatechange", handleReadyStateChange);
    };
  }, [startInShellLoading]);

  return isShellLoading;
}
