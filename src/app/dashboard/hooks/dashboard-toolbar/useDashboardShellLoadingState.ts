"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { DASHBOARD_EVENTS } from "../../constants";

interface ShellLoadingEventDetail {
  loading?: boolean;
}

/** Reads the shell-loading dataset flag from the current document root. */
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

/** Resolves the next shell-loading state from an incoming dashboard event. */
export function readDashboardShellLoadingFromEvent(event: Event) {
  const detail = (event as CustomEvent<ShellLoadingEventDetail>).detail;

  return detail.loading === true;
}

/** Settles the optimistic shell-loading state once document and dataset state are known. */
export function resolveDashboardShellLoadingState({
  hasReceivedShellLoadingEvent,
  readyState,
  shellLoadingFromDocument,
}: {
  hasReceivedShellLoadingEvent: boolean;
  readyState: DocumentReadyState;
  shellLoadingFromDocument: boolean | null;
}) {
  if (shellLoadingFromDocument !== null) {
    return shellLoadingFromDocument;
  }

  if (!hasReceivedShellLoadingEvent && readyState === "complete") {
    return false;
  }

  return null;
}

/**
 * Synchronizes the toolbar shell-loading state with the dashboard event bus.
 *
 * The toolbar starts in an optimistic loading state during the first dashboard
 * hydration and then settles against the document dataset and shell-loading
 * events once the client shell is ready.
 */
export function useDashboardShellLoadingState(startInShellLoading: boolean) {
  const hasReceivedShellLoadingEventRef = useRef(false);
  const [isShellLoading, setIsShellLoading] = useState(startInShellLoading);

  useLayoutEffect(() => {
    const syncShellLoadingFromDocument = () => {
      const shellLoading = readDashboardShellLoadingFromDocument();

      if (shellLoading === null) {
        return false;
      }

      hasReceivedShellLoadingEventRef.current = true;
      setIsShellLoading(shellLoading);
      return true;
    };

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

    const handleShellLoading = (event: Event) => {
      hasReceivedShellLoadingEventRef.current = true;
      setIsShellLoading(readDashboardShellLoadingFromEvent(event));
    };

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

    if (startInShellLoading) {
      document.addEventListener("readystatechange", handleReadyStateChange);
      queueMicrotask(settleOptimisticShellLoading);
    }

    return () => {
      window.removeEventListener(
        DASHBOARD_EVENTS.SHELL_LOADING,
        handleShellLoading as EventListener,
      );
      shellLoadingObserver?.disconnect();

      if (startInShellLoading) {
        document.removeEventListener("readystatechange", handleReadyStateChange);
      }
    };
  }, [startInShellLoading]);

  return isShellLoading;
}