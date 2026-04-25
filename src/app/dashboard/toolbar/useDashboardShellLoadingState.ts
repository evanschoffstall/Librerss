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
    const lifecycle = createDashboardShellLoadingLifecycle(
      hasReceivedShellLoadingEventRef,
      setIsShellLoading,
    );

    window.addEventListener(
      DASHBOARD_EVENTS.SHELL_LOADING,
      lifecycle.handleShellLoading as EventListener,
    );

    const shellLoadingObserver = createDashboardShellLoadingObserver(
      lifecycle.syncShellLoadingFromDocument,
    );

    shellLoadingObserver?.observe(document.documentElement, {
      attributeFilter: ["data-dashboard-shell-loading"],
      attributes: true,
    });

    lifecycle.syncShellLoadingFromDocument();
    document.addEventListener(
      "readystatechange",
      lifecycle.handleReadyStateChange,
    );
    queueMicrotask(lifecycle.settleOptimisticShellLoading);

    return () => {
      window.removeEventListener(
        DASHBOARD_EVENTS.SHELL_LOADING,
        lifecycle.handleShellLoading as EventListener,
      );
      shellLoadingObserver?.disconnect();
      document.removeEventListener(
        "readystatechange",
        lifecycle.handleReadyStateChange,
      );
    };
  }, [startInShellLoading]);

  return isShellLoading;
}

/**
 * Create the shell-loading lifecycle callbacks used by the dashboard shell listener.
 * @param hasReceivedShellLoadingEventRef - Tracks whether a shell-loading signal has arrived.
 * @param setIsShellLoading - Updates the shell-loading state.
 * @returns The lifecycle callbacks used during effect setup and cleanup.
 */
function createDashboardShellLoadingLifecycle(
  hasReceivedShellLoadingEventRef: React.RefObject<boolean>,
  setIsShellLoading: React.Dispatch<React.SetStateAction<boolean>>,
) {
  /**
   * Sync shell-loading state from the document attribute when it is present.
   * @returns Whether the document attribute produced a concrete shell-loading state.
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
   * Resolve shell-loading state after document readiness or microtask settlement.
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
   * Handle explicit shell-loading events emitted by the dashboard shell.
   * @param event - The event carrying the latest shell-loading state.
   */
  const handleShellLoading = (event: Event) => {
    hasReceivedShellLoadingEventRef.current = true;
    setIsShellLoading(readDashboardShellLoadingFromEvent(event));
  };

  return {
    handleReadyStateChange: settleOptimisticShellLoading,
    handleShellLoading,
    settleOptimisticShellLoading,
    syncShellLoadingFromDocument,
  };
}

/**
 * Create the MutationObserver that watches shell-loading document attributes.
 * @param syncShellLoadingFromDocument - Re-reads shell-loading state from the document.
 * @returns The observer instance, or null when MutationObserver is unavailable.
 */
function createDashboardShellLoadingObserver(
  syncShellLoadingFromDocument: () => boolean,
) {
  if (typeof MutationObserver === "undefined") {
    return null;
  }

  return new MutationObserver(() => {
    syncShellLoadingFromDocument();
  });
}
