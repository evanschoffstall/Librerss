import type { Ref } from "react";

import { ArrowDown } from "lucide-react";
import { motion } from "motion/react";

const DASHBOARD_PULL_HINT_TRANSITION = {
  duration: 0.18,
  ease: [0.16, 1, 0.3, 1] as const,
};

interface PullToRefreshSentinelProps {
  isPulling: boolean;
  pullRefreshHint: string;
  readyToRefresh: boolean;
  sentinelHeight: number;
  sentinelRef: Ref<HTMLDivElement>;
}

/**
 * Renders the animated pull-to-refresh sentinel for the dashboard feed surface.
 *
 * Keeping this motion-heavy UI separate from the route view prevents the main
 * dashboard component from mixing shell composition with gesture affordance
 * presentation details.
 *
 * @param props Pull gesture state and sentinel DOM ref.
 * @returns The animated sentinel rendered above the feed list.
 */
export function PullToRefreshSentinel({
  isPulling,
  pullRefreshHint,
  readyToRefresh,
  sentinelHeight,
  sentinelRef,
}: PullToRefreshSentinelProps) {
  const sentinelState = readyToRefresh
    ? "ready"
    : isPulling
      ? "pulling"
      : "idle";

  return (
    <motion.div
      animate={{
        backgroundColor: isPulling
          ? readyToRefresh
            ? "rgb(14 165 233 / 0.25)"
            : "rgb(14 165 233 / 0.10)"
          : "rgb(0 0 0 / 0)",
      }}
      className="mb-2 flex items-end justify-center bg-background"
      data-dashboard-pull-sentinel="true"
      data-dashboard-pull-state={sentinelState}
      initial={false}
      ref={sentinelRef}
      style={{ height: sentinelHeight, overflowAnchor: "none" }}
      transition={DASHBOARD_PULL_HINT_TRANSITION}
    >
      <motion.div
        animate={{ opacity: isPulling ? 1 : 0, y: isPulling ? 0 : 6 }}
        aria-hidden="true"
        className="
          flex items-center gap-1.5 pb-3 text-sky-600
          dark:text-sky-400
        "
        data-dashboard-pull-hint="true"
        initial={false}
        style={{ pointerEvents: "none", visibility: isPulling ? "visible" : "hidden" }}
        transition={DASHBOARD_PULL_HINT_TRANSITION}
      >
        <motion.div
          animate={{
            opacity: readyToRefresh ? 1 : 0.6,
            rotate: readyToRefresh ? 180 : 0,
            scale: readyToRefresh ? 1.1 : 0.9,
          }}
          initial={false}
          transition={DASHBOARD_PULL_HINT_TRANSITION}
        >
          <ArrowDown className="size-4" />
        </motion.div>
        <motion.span
          animate={{ opacity: readyToRefresh ? 1 : 0.7 }}
          className="text-xs font-medium"
          initial={false}
          transition={DASHBOARD_PULL_HINT_TRANSITION}
        >
          {pullRefreshHint}
        </motion.span>
      </motion.div>
    </motion.div>
  );
}
