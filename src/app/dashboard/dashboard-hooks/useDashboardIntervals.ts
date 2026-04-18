"use client";
import {
  Dispatch,
  SetStateAction,
  useEffect,
  useEffectEvent,
  useRef,
} from "react";
import { toast } from "sonner";

import { toAutoRefreshIntervalMs } from "@/app/dashboard/dashboard-services";

/**
 * Brief delay before firing an auto-refresh after tab resume, giving the
 * browser time to restore DNS / TCP / TLS state that may have been torn
 * down while the tab was suspended.
 */
const TAB_RESUME_DELAY_MS = 1_500;

/**
 * Extended delay for tabs that were suspended for a long period.
 * Gives the browser extra time to re-establish DNS/TCP/TLS after
 * prolonged suspension (e.g. Overnight, device sleep).
 */
const STALE_TAB_RESUME_DELAY_MS = 4_000;

/**
 * Threshold beyond which a hidden tab is considered stale. Toasts are
 * dismissed and any pending foreground request is cancelled to avoid
 * phantom error pop-ups on resume.
 */
export const STALE_TAB_THRESHOLD_MS = 30_000;

interface UseDashboardIntervalsOptions {
  autoRefreshFeedList: () => Promise<void>;
  autoRefreshIntervalMinutes: number;
  /** Called when the tab resumes after a long suspension so the controller can cancel stale requests and clear query errors. */
  onStaleTabResume?: () => void;
  setRelativeRefreshTick: Dispatch<SetStateAction<number>>;
}

/**
 * Manage the dashboard intervals.
 * @param options - The options used to manage the dashboard intervals.
 */
export function useDashboardIntervals(options: UseDashboardIntervalsOptions) {
  const {
    autoRefreshFeedList,
    autoRefreshIntervalMinutes,
    onStaleTabResume,
    setRelativeRefreshTick,
  } = options;
  useRelativeRefreshTicker(setRelativeRefreshTick);

  const lastFiredAtRef = useRef(Date.now());
  const hiddenAtRef = useRef<null | number>(null);
  const runRefresh = useEffectEvent(() => {
    lastFiredAtRef.current = Date.now();
    void autoRefreshFeedList();
  });

  const stableOnStaleTabResume = useEffectEvent(() => {
    onStaleTabResume?.();
  });

  useEffect(() => {
    const autoRefreshIntervalMs = toAutoRefreshIntervalMs(
      autoRefreshIntervalMinutes,
    );

    lastFiredAtRef.current = Date.now();

    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      runRefresh();
    }, autoRefreshIntervalMs);

    // When returning to a suspended tab, delay briefly so the browser can
    // restore network connectivity before firing the refresh request.
    let resumeTimerId: ReturnType<typeof setTimeout> | undefined;

    /**
     * Process the handle visibility change.
     */
    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
        clearTimeout(resumeTimerId);
        return;
      }

      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      const suspensionMs = hiddenAt !== null ? Date.now() - hiddenAt : 0;
      const isStaleResume = suspensionMs >= STALE_TAB_THRESHOLD_MS;

      if (isStaleResume) {
        // Dismiss toasts that were frozen mid-countdown during suspension
        // and cancel any pending foreground request whose timeout would
        // fire stale error pop-ups.
        toast.dismiss();
        stableOnStaleTabResume();
      }

      if (Date.now() - lastFiredAtRef.current >= autoRefreshIntervalMs) {
        const resumeDelay = isStaleResume
          ? STALE_TAB_RESUME_DELAY_MS
          : TAB_RESUME_DELAY_MS;

        resumeTimerId = setTimeout(() => {
          if (!document.hidden) {
            runRefresh();
          }
        }, resumeDelay);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      clearTimeout(resumeTimerId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [autoRefreshIntervalMinutes]);
}

/**
 * Manage the relative refresh ticker.
 * @param setRelativeRefreshTick - The set relative refresh tick.
 */
function useRelativeRefreshTicker(
  setRelativeRefreshTick: Dispatch<SetStateAction<number>>,
) {
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRelativeRefreshTick((current) => current + 1);
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [setRelativeRefreshTick]);
}
