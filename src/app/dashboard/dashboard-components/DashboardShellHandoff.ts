"use client";

import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/** Opacity fade-in duration shared with skeleton-backed article entry. */
export const DASHBOARD_SHELL_HANDOFF_OPACITY_DURATION_MS = 45;
/** Delay before hydrated content fades in after the skeleton layer commits. */
export const DASHBOARD_SHELL_HANDOFF_OPACITY_DELAY_MS = 0;
/** Total time before hydrated shell controls are interactive after loading. */
export const DASHBOARD_SHELL_HANDOFF_TOTAL_DONE_MS =
  DASHBOARD_SHELL_HANDOFF_OPACITY_DURATION_MS +
  DASHBOARD_SHELL_HANDOFF_OPACITY_DELAY_MS +
  8;

/** Describes the current synchronized shell handoff phase. */
type DashboardShellHandoffPhase = "animating" | "done" | "initial" | "loading";

/** Describes the values returned by the shell handoff hook. */
interface DashboardShellHandoffState {
  /** Inline style applied to the hydrated surface while it fades over skeletons. */
  contentStyle: CSSProperties;
  /** Whether hydrated content should be mounted for the current phase. */
  shouldRenderHydratedContent: boolean;
  /** Whether the skeleton backing layer should remain visible. */
  shouldRenderSkeletonBackdrop: boolean;
}

/**
 * Coordinate shell chrome hydration with the article row fade-in contract.
 * @param isShellLoading - Whether the shell skeleton should own the surface.
 * @returns Rendering flags and styles for the synchronized handoff.
 */
export function useDashboardShellHandoff(
  isShellLoading: boolean,
): DashboardShellHandoffState {
  const wasShellLoadingRef = useRef(isShellLoading);
  const [phase, setPhase] = useState<DashboardShellHandoffPhase>(() =>
    isShellLoading ? "loading" : "done",
  );

  useLayoutEffect(() => {
    if (isShellLoading) {
      wasShellLoadingRef.current = true;
      setPhase("loading");
      return;
    }

    if (wasShellLoadingRef.current) {
      wasShellLoadingRef.current = false;
      setPhase("initial");
      return;
    }

    setPhase("done");
  }, [isShellLoading]);

  useEffect(() => {
    if (phase !== "initial") {
      return;
    }

    setPhase("animating");
  }, [phase]);

  useEffect(() => {
    if (phase !== "animating") {
      return;
    }

    const timerId = window.setTimeout(() => {
      setPhase("done");
    }, DASHBOARD_SHELL_HANDOFF_TOTAL_DONE_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [phase]);

  const isEntering = phase === "initial" || phase === "animating";

  return {
    contentStyle: {
      opacity: phase === "initial" ? 0 : 1,
      pointerEvents: isEntering ? "none" : "auto",
      transition: isEntering
        ? `opacity ${DASHBOARD_SHELL_HANDOFF_OPACITY_DURATION_MS}ms ease-out ${DASHBOARD_SHELL_HANDOFF_OPACITY_DELAY_MS}ms`
        : undefined,
    },
    shouldRenderHydratedContent: phase !== "loading",
    shouldRenderSkeletonBackdrop: isShellLoading || isEntering,
  };
}
