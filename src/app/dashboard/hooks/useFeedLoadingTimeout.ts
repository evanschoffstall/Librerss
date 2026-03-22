"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { type UseFeedLoadingTimeoutOptions } from "./dashboard-effects.types";

/** Enforces a client-side timeout around dashboard feed-loading sessions. */
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