"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { type UseFeedLoadingTimeoutOptions } from "@/app/dashboard/dashboard-hooks/dashboard-effects.contracts";

/**
 * Enforces a client-side timeout around dashboard feed-loading sessions.
 * @param root0
 * @param root0.loading
 * @param root0.loadingEpoch
 * @param root0.onTimeout
 * @param root0.setLoading
 * @param root0.timeoutMs
 */
export function useFeedLoadingTimeout({
  loading,
  loadingEpoch,
  onTimeout,
  setLoading,
  timeoutMs,
}: UseFeedLoadingTimeoutOptions) {
  useEffect(() => {
    if (!loading) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (onTimeout) {
        onTimeout();
      } else {
        setLoading(false);
      }
      toast.error("Feed loading timed out.", {
        description: "Please try refreshing the selected source again.",
      });
    }, timeoutMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loading, loadingEpoch, timeoutMs, setLoading, onTimeout]);
}
