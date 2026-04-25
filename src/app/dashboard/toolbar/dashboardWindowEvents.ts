"use client";

export {
  readDashboardShellLoadingFromDocument,
  readDashboardShellLoadingFromEvent,
  resolveDashboardShellLoadingState,
} from "@/app/dashboard/toolbar/useDashboardShellLoadingState";

/**
 * Process the dispatch dashboard window event.
 * @param eventName - The event name.
 * @param detail - The detail.
 */
export function dispatchDashboardWindowEvent(
  eventName: string,
  detail?: Record<string, unknown>,
) {
  window.dispatchEvent(
    new CustomEvent(eventName, detail ? { detail } : undefined),
  );
}

/**
 * Process the read dashboard preview mode from location.
 * @returns Whether read dashboard preview mode from location.
 */
export function readDashboardPreviewModeFromLocation() {
  if (typeof window === "undefined") {
    return false;
  }

  return new URLSearchParams(window.location.search).get("explore") === "1";
}
