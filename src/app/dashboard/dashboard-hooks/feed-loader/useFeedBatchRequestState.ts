"use client";

import { type QueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import type { getFeedBatchQueryKey } from "@/app/dashboard/dashboard-services";

import { isCanceledBatchRequest } from "@/app/dashboard/dashboard-services/feed-loader-state";

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

interface FeedBatchRequestActionsOptions {
  loadingRef: React.RefObject<boolean>;
  queryClient: QueryClient;
  requestRefs: ReturnType<typeof useFeedBatchRequestRefs>;
  setLoadingEpoch: React.Dispatch<React.SetStateAction<number>>;
  syncLoading: (value: boolean) => void;
}

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

interface StartNextFeedRequestOptions {
  activeRequestQueryKeyRef: React.RefObject<FeedBatchQueryKey | null>;
  activeRequestSignatureRef: React.RefObject<null | string>;
  currentRequestIdRef: React.RefObject<number>;
  isBackground: boolean;
  queryClient: QueryClient;
  queryKey: FeedBatchQueryKey;
  requestSignature: string;
  setLoadingEpoch: React.Dispatch<React.SetStateAction<number>>;
  syncLoading: (value: boolean) => void;
}

interface UseFeedBatchRequestStateOptions {
  queryClient: QueryClient;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Manage the feed batch request state.
 * @param options - The options used to manage the feed batch request state.
 * @returns The feed batch request state state and callbacks.
 */
export function useFeedBatchRequestState(
  options: UseFeedBatchRequestStateOptions,
): FeedBatchRequestState {
  const { queryClient, setLoading } = options;
  const { loading, loadingEpoch, loadingRef, setLoadingEpoch, syncLoading } =
    useFeedBatchLoadingState(setLoading);
  const requestRefs = useFeedBatchRequestRefs();
  const requestActions = useFeedBatchRequestActions({
    loadingRef,
    queryClient,
    requestRefs,
    setLoadingEpoch,
    syncLoading,
  });

  return {
    ...requestActions,
    loading,
    loadingEpoch,
  };
}
/**
 * Process the cancel active feed batch query.
 * @param activeRequestQueryKeyRef - The ref that stores the active request query key ref.
 * @param queryClient - The query client.
 */
function cancelActiveFeedBatchQuery(
  activeRequestQueryKeyRef: React.RefObject<FeedBatchQueryKey | null>,
  queryClient: QueryClient,
) {
  const activeRequestQueryKey = activeRequestQueryKeyRef.current;

  if (!activeRequestQueryKey) {
    return;
  }

  void queryClient
    .cancelQueries({
      exact: true,
      queryKey: activeRequestQueryKey,
    })
    .catch((error: unknown) => {
      if (isCanceledBatchRequest(error)) {
        return;
      }

      console.error("Failed to cancel active feed batch query", error);
    });
}

/**
 * Process the reset active feed request.
 * @param requestRefs - The request refs.
 * @param syncLoading - The callback that sync loading.
 */
function resetActiveFeedRequest(
  requestRefs: ReturnType<typeof useFeedBatchRequestRefs>,
  syncLoading: (value: boolean) => void,
) {
  requestRefs.activeRequestQueryKeyRef.current = null;
  requestRefs.activeRequestSignatureRef.current = null;
  syncLoading(false);
}

/**
 * Process the start next feed request.
 * @param options - The options used to process the start next feed request.
 * @returns The start next feed request.
 */
function startNextFeedRequest(options: StartNextFeedRequestOptions) {
  const {
    activeRequestQueryKeyRef,
    activeRequestSignatureRef,
    currentRequestIdRef,
    isBackground,
    queryClient,
    queryKey,
    requestSignature,
    setLoadingEpoch,
    syncLoading,
  } = options;
  currentRequestIdRef.current += 1;
  const requestId = currentRequestIdRef.current;

  cancelActiveFeedBatchQuery(activeRequestQueryKeyRef, queryClient);
  activeRequestSignatureRef.current = requestSignature;
  activeRequestQueryKeyRef.current = queryKey;

  if (!isBackground) {
    syncLoading(true);
    setLoadingEpoch((epoch) => epoch + 1);
  }

  return requestId;
}
/**
 * Manage the feed batch loading state.
 * @param setLoading - The set loading.
 * @returns The feed batch loading state state and callbacks.
 */
function useFeedBatchLoadingState(
  setLoading: React.Dispatch<React.SetStateAction<boolean>>,
) {
  const loadingRef = useRef(false);
  const [loading, setLocalLoading] = useState(false);
  const [loadingEpoch, setLoadingEpoch] = useState(0);
  const syncLoading = useCallback(
    (value: boolean) => {
      loadingRef.current = value;
      setLocalLoading(value);
      setLoading(value);
    },
    [setLoading],
  );

  return { loading, loadingEpoch, loadingRef, setLoadingEpoch, syncLoading };
}

/**
 * Manage the feed batch request actions.
 * @param options - The options used to manage the feed batch request actions.
 * @returns The feed batch request actions state and callbacks.
 */
function useFeedBatchRequestActions(options: FeedBatchRequestActionsOptions) {
  const { loadingRef, queryClient, requestRefs, setLoadingEpoch, syncLoading } =
    options;
  const beginFeedRequest = useCallback(
    ({
      forceRefresh,
      isBackground,
      queryKey,
      requestSignature,
    }: BeginFeedRequestOptions): BeginFeedRequestResult => {
      if (
        loadingRef.current &&
        requestRefs.activeRequestSignatureRef.current === requestSignature &&
        !forceRefresh
      ) {
        return {
          requestId: requestRefs.currentRequestIdRef.current,
          skippedDuplicate: true,
        };
      }

      return {
        requestId: startNextFeedRequest({
          activeRequestQueryKeyRef: requestRefs.activeRequestQueryKeyRef,
          activeRequestSignatureRef: requestRefs.activeRequestSignatureRef,
          currentRequestIdRef: requestRefs.currentRequestIdRef,
          isBackground,
          queryClient,
          queryKey,
          requestSignature,
          setLoadingEpoch,
          syncLoading,
        }),
        skippedDuplicate: false,
      };
    },
    [loadingRef, queryClient, requestRefs, setLoadingEpoch, syncLoading],
  );
  const finishFeedRequest = useCallback(
    (requestId: number) => {
      if (requestRefs.currentRequestIdRef.current !== requestId) {
        return;
      }
      resetActiveFeedRequest(requestRefs, syncLoading);
    },
    [requestRefs, syncLoading],
  );
  const isCurrentFeedRequest = useCallback(
    (requestId: number) =>
      requestRefs.currentRequestIdRef.current === requestId,
    [requestRefs],
  );
  const cancelPendingRequest = useCallback(() => {
    cancelActiveFeedBatchQuery(
      requestRefs.activeRequestQueryKeyRef,
      queryClient,
    );
    resetActiveFeedRequest(requestRefs, syncLoading);
    requestRefs.currentRequestIdRef.current += 1;
    return requestRefs.currentRequestIdRef.current;
  }, [queryClient, requestRefs, syncLoading]);
  const isLoadingRequest = useCallback(() => loadingRef.current, [loadingRef]);

  return {
    beginFeedRequest,
    cancelPendingRequest,
    finishFeedRequest,
    isCurrentFeedRequest,
    isLoadingRequest,
  };
}

/**
 * Manage the feed batch request refs.
 * @returns The feed batch request refs state and callbacks.
 */
function useFeedBatchRequestRefs() {
  return {
    activeRequestQueryKeyRef: useRef<FeedBatchQueryKey | null>(null),
    activeRequestSignatureRef: useRef<null | string>(null),
    currentRequestIdRef: useRef(0),
  };
}
