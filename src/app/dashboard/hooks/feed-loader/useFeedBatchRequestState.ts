"use client";

import { type QueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import { getFeedBatchQueryKey } from "../../services/query-keys";

interface BeginFeedRequestOptions {
  forceRefresh: boolean;
  isBackground: boolean;
  queryKey: ReturnType<typeof getFeedBatchQueryKey>;
  requestSignature: string;
}

type BeginFeedRequestResult =
  | {
      requestId: number;
      skippedDuplicate: false;
    }
  | {
      requestId: number;
      skippedDuplicate: true;
    };

type FeedBatchQueryKey = ReturnType<typeof getFeedBatchQueryKey>;

interface FeedBatchRequestState {
  beginFeedRequest: (
    options: BeginFeedRequestOptions,
  ) => BeginFeedRequestResult;
  cancelPendingRequest: () => number;
  finishFeedRequest: (requestId: number) => void;
  isCurrentFeedRequest: (requestId: number) => boolean;
  isLoadingRequest: () => boolean;
  loading: boolean;
  loadingEpoch: number;
}

interface UseFeedBatchRequestStateOptions {
  queryClient: QueryClient;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Tracks the active dashboard feed request and mirrors foreground loading state.
 *
 * The feed loader uses this hook as the single authority for request IDs,
 * duplicate-request suppression, TanStack cancellation, and shared loading epochs.
 */
export function useFeedBatchRequestState({
  queryClient,
  setLoading,
}: UseFeedBatchRequestStateOptions): FeedBatchRequestState {
  const currentRequestIdRef = useRef(0);
  const activeRequestSignatureRef = useRef<null | string>(null);
  const activeRequestQueryKeyRef = useRef<FeedBatchQueryKey | null>(null);
  const loadingRef = useRef(false);
  const [loading, setLocalLoading] = useState(false);
  const [loadingEpoch, setLoadingEpoch] = useState(0);

  /** Mirrors loader activity into local state and the shared controller loading flag. */
  const syncLoading = useCallback(
    (value: boolean) => {
      loadingRef.current = value;
      setLocalLoading(value);
      setLoading(value);
    },
    [setLoading],
  );

  /** Starts a new request session while canceling the previous query when needed. */
  const beginFeedRequest = useCallback(
    ({
      forceRefresh,
      isBackground,
      queryKey,
      requestSignature,
    }: BeginFeedRequestOptions): BeginFeedRequestResult => {
      if (
        loadingRef.current &&
        activeRequestSignatureRef.current === requestSignature &&
        !forceRefresh
      ) {
        return {
          requestId: currentRequestIdRef.current,
          skippedDuplicate: true,
        };
      }

      currentRequestIdRef.current += 1;
      const requestId = currentRequestIdRef.current;

      if (activeRequestQueryKeyRef.current) {
        void queryClient.cancelQueries({
          exact: true,
          queryKey: activeRequestQueryKeyRef.current,
        });
      }

      activeRequestSignatureRef.current = requestSignature;
      activeRequestQueryKeyRef.current = queryKey;

      if (!isBackground) {
        syncLoading(true);
        setLoadingEpoch((epoch) => epoch + 1);
      }

      return {
        requestId,
        skippedDuplicate: false,
      };
    },
    [queryClient, syncLoading],
  );

  /** Completes the active request session when the request is still current. */
  const finishFeedRequest = useCallback(
    (requestId: number) => {
      if (currentRequestIdRef.current !== requestId) {
        return;
      }

      activeRequestQueryKeyRef.current = null;
      activeRequestSignatureRef.current = null;
      syncLoading(false);
    },
    [syncLoading],
  );

  /** Returns whether a request id still points at the most recent session. */
  const isCurrentFeedRequest = useCallback(
    (requestId: number) => currentRequestIdRef.current === requestId,
    [],
  );

  /** Cancels the current query-backed request and clears visible loading state. */
  const cancelPendingRequest = useCallback(() => {
    if (activeRequestQueryKeyRef.current) {
      void queryClient.cancelQueries({
        exact: true,
        queryKey: activeRequestQueryKeyRef.current,
      });
    }

    activeRequestQueryKeyRef.current = null;
    activeRequestSignatureRef.current = null;
    currentRequestIdRef.current += 1;
    syncLoading(false);
    return currentRequestIdRef.current;
  }, [queryClient, syncLoading]);

  /** Exposes whether a foreground loader request is currently active. */
  const isLoadingRequest = useCallback(() => loadingRef.current, []);

  return {
    beginFeedRequest,
    cancelPendingRequest,
    finishFeedRequest,
    isCurrentFeedRequest,
    isLoadingRequest,
    loading,
    loadingEpoch,
  };
}