"use client";

/** Dispatches a dashboard-scoped custom event with an optional detail payload. */
export function dispatchDashboardWindowEvent(
  eventName: string,
  detail?: Record<string, unknown>,
) {
  window.dispatchEvent(
    new CustomEvent(eventName, detail ? { detail } : undefined),
  );
}

/** Returns whether the active dashboard URL is explicitly in explore mode. */
export function readDashboardPreviewModeFromLocation() {
  if (typeof window === "undefined") {
    return false;
  }

  return new URLSearchParams(window.location.search).get("explore") === "1";
}