"use client";
import type { Dispatch, SetStateAction } from "react";

import { useEffect, useEffectEvent, useRef } from "react";
import { toast } from "sonner";

import { toAutoRefreshIntervalMs } from "@/app/dashboard/services";

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

/** Runtime callbacks and refs needed by the dashboard interval coordinator. */
interface DashboardIntervalRuntimeOptions {
  autoRefreshIntervalMs: number;
  incrementRelativeRefreshTick: () => void;
  lastFiredAtRef: MutableValueRef<number>;
  runRefresh: () => void;
  stableOnStaleTabResume: () => void;
  suspendedAtRef: MutableValueRef<null | number>;
}

/** Mutable ref shape used by the interval runtime without coupling it to React internals. */
interface MutableValueRef<TValue> {
  current: TValue;
}

/**
 * Options for coordinating the dashboard's automatic refresh cadence and
 * user-facing relative time ticker.
 */
interface UseDashboardIntervalsOptions {
  /** Runs a background feed-list refresh when the configured cadence elapses. */
  autoRefreshFeedList: () => Promise<void>;
  /** Number of minutes between automatic feed-list refresh attempts. */
  autoRefreshIntervalMinutes: number;
  /** Called when the tab resumes after a long suspension so the controller can cancel stale requests and clear query errors. */
  onStaleTabResume?: () => void;
  /** Updates relative timestamps after periodic ticks or browser resume events. */
  setRelativeRefreshTick: Dispatch<SetStateAction<number>>;
}

/** Coordinates browser lifecycle signals for dashboard auto-refresh timers. */
class DashboardIntervalRuntime {
  /**
   * Monotonic token used to invalidate delayed refresh callbacks that were
   * scheduled by older lifecycle events.
   */
  private resumeTimerGeneration = 0;
  /**
   * Current delayed resume-refresh timer, if a resume signal scheduled one.
   */
  private resumeTimerId: ReturnType<typeof setTimeout> | undefined;

  /**
   * Creates a dashboard interval runtime.
   *
   * @param options - Runtime callbacks, refs, and refresh cadence.
   */
  public constructor(
    private readonly options: DashboardIntervalRuntimeOptions,
  ) {}

  /**
   * Attaches interval and browser lifecycle listeners.
   *
   * @returns A cleanup callback that removes listeners and cancels delayed work.
   */
  public start(): () => void {
    const intervalId = window.setInterval(
      this.handleIntervalTick,
      this.options.autoRefreshIntervalMs,
    );

    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    document.addEventListener("freeze", this.markSuspended);
    document.addEventListener("resume", this.reassessAutoRefreshTimer);
    window.addEventListener("focus", this.reassessAutoRefreshTimer);
    window.addEventListener("online", this.reassessAutoRefreshTimer);
    window.addEventListener("pagehide", this.markSuspended);
    window.addEventListener("pageshow", this.reassessAutoRefreshTimer);

    return () => {
      window.clearInterval(intervalId);
      this.cancelPendingResumeRefresh();
      document.removeEventListener(
        "visibilitychange",
        this.handleVisibilityChange,
      );
      document.removeEventListener("freeze", this.markSuspended);
      document.removeEventListener("resume", this.reassessAutoRefreshTimer);
      window.removeEventListener("focus", this.reassessAutoRefreshTimer);
      window.removeEventListener("online", this.reassessAutoRefreshTimer);
      window.removeEventListener("pagehide", this.markSuspended);
      window.removeEventListener("pageshow", this.reassessAutoRefreshTimer);
    };
  }

  /** Cancels delayed resume work and invalidates already scheduled callbacks. */
  private readonly cancelPendingResumeRefresh = () => {
    this.resumeTimerGeneration += 1;
    clearTimeout(this.resumeTimerId);
    this.resumeTimerId = undefined;
  };

  /** Handles normal interval ticks with a wall-clock elapsed-time guard. */
  private readonly handleIntervalTick = () => {
    if (document.hidden) {
      this.markSuspended();
      return;
    }

    if (this.hasRefreshCadenceElapsed()) {
      this.options.runRefresh();
    }
  };

  /**
   * Runs stale-tab cleanup and reports whether the resume was stale.
   *
   * @param suspensionMs - Wall-clock time between suspension and resume.
   * @returns True when the stale-resume recovery path should be used.
   */
  private handleStaleResume(suspensionMs: number) {
    const isStaleResume = suspensionMs >= STALE_TAB_THRESHOLD_MS;

    if (isStaleResume) {
      toast.dismiss();
      this.options.stableOnStaleTabResume();
    }

    return isStaleResume;
  }

  /** Routes visibility changes into the shared suspension/resume flow. */
  private readonly handleVisibilityChange = () => {
    if (document.hidden) {
      this.markSuspended();
      return;
    }

    this.reassessAutoRefreshTimer();
  };

  /**
   * Checks whether the configured auto-refresh cadence has elapsed.
   *
   * @param now - Optional wall-clock timestamp to reuse across a resume pass.
   * @returns True when a refresh is due.
   */
  private hasRefreshCadenceElapsed(now = Date.now()) {
    return (
      now - this.options.lastFiredAtRef.current >=
      this.options.autoRefreshIntervalMs
    );
  }

  /** Records the first suspension time and clears obsolete delayed work. */
  private readonly markSuspended = () => {
    this.options.suspendedAtRef.current ??= Date.now();
    this.cancelPendingResumeRefresh();
  };

  /** Reconciles auto-refresh state after a browser resume-like lifecycle event. */
  private readonly reassessAutoRefreshTimer = () => {
    if (document.hidden) {
      this.markSuspended();
      return;
    }

    const now = Date.now();
    const suspendedAt = this.options.suspendedAtRef.current;
    this.options.suspendedAtRef.current = null;
    this.options.incrementRelativeRefreshTick();

    const suspensionMs = suspendedAt === null ? 0 : now - suspendedAt;
    const isStaleResume = this.handleStaleResume(suspensionMs);

    if (this.hasRefreshCadenceElapsed(now)) {
      this.scheduleResumeRefresh(isStaleResume);
      return;
    }

    this.cancelPendingResumeRefresh();
  };

  /**
   * Schedules a guarded delayed refresh after browser resume.
   *
   * @param isStaleResume - Whether the tab needs the longer stale-resume delay.
   */
  private scheduleResumeRefresh(isStaleResume: boolean) {
    const resumeDelay = isStaleResume
      ? STALE_TAB_RESUME_DELAY_MS
      : TAB_RESUME_DELAY_MS;
    const scheduledGeneration = this.resumeTimerGeneration + 1;

    this.cancelPendingResumeRefresh();
    this.resumeTimerGeneration = scheduledGeneration;
    this.resumeTimerId = setTimeout(() => {
      if (
        this.resumeTimerGeneration !== scheduledGeneration ||
        document.hidden ||
        !this.hasRefreshCadenceElapsed()
      ) {
        return;
      }

      this.options.runRefresh();
    }, resumeDelay);
  }
}

/**
 * Coordinates dashboard auto-refresh timers across regular intervals and
 * browser lifecycle resumes.
 *
 * @param options - Dashboard timer callbacks, refresh cadence, and stale-resume
 * cleanup hooks.
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
  const suspendedAtRef = useRef<null | number>(null);
  const runRefresh = useEffectEvent(() => {
    lastFiredAtRef.current = Date.now();
    void autoRefreshFeedList();
  });

  const incrementRelativeRefreshTick = useEffectEvent(() => {
    setRelativeRefreshTick((current) => current + 1);
  });
  const stableOnStaleTabResume = useEffectEvent(() => onStaleTabResume?.());

  useEffect(() => {
    const autoRefreshIntervalMs = toAutoRefreshIntervalMs(
      autoRefreshIntervalMinutes,
    );
    lastFiredAtRef.current = Date.now();

    const runtime = new DashboardIntervalRuntime({
      autoRefreshIntervalMs,
      incrementRelativeRefreshTick,
      lastFiredAtRef,
      runRefresh,
      stableOnStaleTabResume,
      suspendedAtRef,
    });

    return runtime.start();
  }, [autoRefreshIntervalMinutes]);
}

/**
 * Advances the relative refresh ticker on a fixed cadence while the dashboard
 * remains mounted.
 *
 * @param setRelativeRefreshTick - State setter that invalidates relative time
 * labels throughout the dashboard.
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
