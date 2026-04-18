"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { type UseFeedLoadingTimeoutOptions } from "@/app/dashboard/dashboard-hooks/dashboard-effects.contracts";

/**
 * Manage the feed loading timeout.
 * @param options - The options used to manage the feed loading timeout.
 */
export function useFeedLoadingTimeout(options: UseFeedLoadingTimeoutOptions) {
  const { loading, loadingEpoch, onTimeout, setLoading, timeoutMs } = options;
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
