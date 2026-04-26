"use client";

import { type QueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import type { getFeedBatchQueryKey } from "@/app/dashboard/dashboard-services";

import { isCanceledBatchRequest } from "@/app/dashboard/dashboard-services/feed-loader-state";

/**
 * Describes the feed batch request state.
 *
 * The `isBackgroundLoading` flag tracks in-flight background fetches (those
 * issued with `keepExistingFeed: true`, i.e. Search-change requests). It is
 * separate from `loading` so the feed list can show skeletons when the current
 * visible window produces zero local matches but the server may still return
 * hits — without triggering a full shell-loading animation.
 */
export interface FeedBatchRequestState {
  beginFeedRequest: (
    options: BeginFeedRequestOptions,
  ) => BeginFeedRequestResult;
  cancelPendingRequest: () => number;
  finishFeedRequest: (requestId: number) => void;
  isBackgroundLoading: boolean;
  isCurrentFeedRequest: (requestId: number) => boolean;
  isLoadingRequest: () => boolean;
  loading: boolean;
  loadingEpoch: number;
}

/**
 * Describes the options for begin feed request.
 */
interface BeginFeedRequestOptions {
  forceRefresh: boolean;
  isBackground: boolean;
  queryKey: ReturnType<typeof getFeedBatchQueryKey>;
  requestSignature: string;
}

/**
 * Describes the begin feed request result.
 */
type BeginFeedRequestResult =
  | {
      requestId: number;
      skippedDuplicate: false;
    }
  | {
      requestId: number;
      skippedDuplicate: true;
    };

/**
 * Defines the feed batch query key type.
 */
type FeedBatchQueryKey = ReturnType<typeof getFeedBatchQueryKey>;

/**
 * Describes the options for feed batch request actions.
 */
interface FeedBatchRequestActionsOptions {
  loadingRef: React.RefObject<boolean>;
  queryClient: QueryClient;
  requestRefs: ReturnType<typeof useFeedBatchRequestRefs>;
  setLoadingEpoch: React.Dispatch<React.SetStateAction<number>>;
  syncBackgroundLoading: (value: boolean) => void;
  syncLoading: (value: boolean) => void;
}

/**
 * Describes the options for start next feed request.
 */
interface StartNextFeedRequestOptions {
  activeRequestQueryKeyRef: React.RefObject<FeedBatchQueryKey | null>;
  activeRequestSignatureRef: React.RefObject<null | string>;
  currentRequestIdRef: React.RefObject<number>;
  isBackground: boolean;
  queryClient: QueryClient;
  queryKey: FeedBatchQueryKey;
  requestSignature: string;
  setLoadingEpoch: React.Dispatch<React.SetStateAction<number>>;
  syncBackgroundLoading: (value: boolean) => void;
  syncLoading: (value: boolean) => void;
}

/**
 * Describes the options for use feed batch request state.
 */
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
  const {
    isBackgroundLoading,
    loading,
    loadingEpoch,
    loadingRef,
    setLoadingEpoch,
    syncBackgroundLoading,
    syncLoading,
  } = useFeedBatchLoadingState(setLoading);
  const requestRefs = useFeedBatchRequestRefs();
  const requestActions = useFeedBatchRequestActions({
    loadingRef,
    queryClient,
    requestRefs,
    setLoadingEpoch,
    syncBackgroundLoading,
    syncLoading,
  });

  return {
    ...requestActions,
    isBackgroundLoading,
    loading,
    loadingEpoch,
  };
}
/**
 * Standalone implementation for beginning a feed request, extracted from
 * `useFeedBatchRequestActions` to keep that hook within the line-length budget
 * while avoiding any change to observable behaviour.
 * @param beginOptions - The per-call options describing the desired fetch.
 * @param actionOptions - The closed-over action dependencies from the parent hook.
 * @returns The result of the begin feed request.
 */
function beginFeedRequestImpl(
  beginOptions: BeginFeedRequestOptions,
  actionOptions: FeedBatchRequestActionsOptions,
): BeginFeedRequestResult {
  const { forceRefresh, isBackground, queryKey, requestSignature } =
    beginOptions;
  const {
    loadingRef,
    queryClient,
    requestRefs,
    setLoadingEpoch,
    syncBackgroundLoading,
    syncLoading,
  } = actionOptions;
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
      syncBackgroundLoading,
      syncLoading,
    }),
    skippedDuplicate: false,
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
 * @param syncBackgroundLoading - The callback that clears the background-loading flag.
 * @param syncLoading - The callback that sync loading.
 */
function resetActiveFeedRequest(
  requestRefs: ReturnType<typeof useFeedBatchRequestRefs>,
  syncBackgroundLoading: (value: boolean) => void,
  syncLoading: (value: boolean) => void,
) {
  requestRefs.activeRequestQueryKeyRef.current = null;
  requestRefs.activeRequestSignatureRef.current = null;
  syncBackgroundLoading(false);
  syncLoading(false);
}
/**
 * Process the start next feed request.
 *
 * Background requests (search-change) set `isBackgroundLoading` instead of
 * the main `loading` flag so the feed surface can show article-shell skeletons
 * without triggering a full shell reload animation.
 * @param options - The options used to process the start next feed request.
 * @returns The new request ID.
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
    syncBackgroundLoading,
    syncLoading,
  } = options;
  currentRequestIdRef.current += 1;
  const requestId = currentRequestIdRef.current;

  cancelActiveFeedBatchQuery(activeRequestQueryKeyRef, queryClient);
  activeRequestSignatureRef.current = requestSignature;
  activeRequestQueryKeyRef.current = queryKey;

  if (isBackground) {
    // Background fetches (e.g. search-change with keepExistingFeed) do not
    // show the full shell loading indicator; they only raise the
    // isBackgroundLoading flag so the feed list can conditionally render
    // article skeletons when the visible window is currently empty.
    syncBackgroundLoading(true);
  } else {
    syncBackgroundLoading(false);
    syncLoading(true);
    setLoadingEpoch((epoch) => epoch + 1);
  }

  return requestId;
}

/**
 * Manage the feed batch loading state.
 *
 * Tracks two orthogonal loading signals:
 * - `loading` — a foreground fetch is in flight (triggers shell skeleton / refresh indicator).
 * - `isBackgroundLoading` — a background fetch is in flight (e.g. Search-change); used to
 *   show article-shell skeletons when the visible window is empty without a full shell reload.
 * @param setLoading - External setter that mirrors the foreground loading flag into dashboard state.
 * @returns The feed batch loading state state and callbacks.
 */
function useFeedBatchLoadingState(
  setLoading: React.Dispatch<React.SetStateAction<boolean>>,
) {
  const loadingRef = useRef(false);
  const [loading, setLocalLoading] = useState(false);
  const [isBackgroundLoading, setIsBackgroundLoading] = useState(false);
  const [loadingEpoch, setLoadingEpoch] = useState(0);
  const syncLoading = useCallback(
    (value: boolean) => {
      loadingRef.current = value;
      setLocalLoading(value);
      setLoading(value);
    },
    [setLoading],
  );
  const syncBackgroundLoading = useCallback((value: boolean) => {
    setIsBackgroundLoading(value);
  }, []);

  return {
    isBackgroundLoading,
    loading,
    loadingEpoch,
    loadingRef,
    setLoadingEpoch,
    syncBackgroundLoading,
    syncLoading,
  };
}

/**
 * Manage the feed batch request actions.
 * @param options - The options used to manage the feed batch request actions.
 * @returns The feed batch request actions state and callbacks.
 */
function useFeedBatchRequestActions(options: FeedBatchRequestActionsOptions) {
  const {
    loadingRef,
    queryClient,
    requestRefs,
    setLoadingEpoch,
    syncBackgroundLoading,
    syncLoading,
  } = options;
  const beginFeedRequest = useCallback(
    (opts: BeginFeedRequestOptions): BeginFeedRequestResult =>
      beginFeedRequestImpl(opts, {
        loadingRef,
        queryClient,
        requestRefs,
        setLoadingEpoch,
        syncBackgroundLoading,
        syncLoading,
      }),
    [
      loadingRef,
      queryClient,
      requestRefs,
      setLoadingEpoch,
      syncBackgroundLoading,
      syncLoading,
    ],
  );
  const finishFeedRequest = useCallback(
    (requestId: number) => {
      if (requestRefs.currentRequestIdRef.current !== requestId) {
        return;
      }
      resetActiveFeedRequest(requestRefs, syncBackgroundLoading, syncLoading);
    },
    [requestRefs, syncBackgroundLoading, syncLoading],
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
    resetActiveFeedRequest(requestRefs, syncBackgroundLoading, syncLoading);
    requestRefs.currentRequestIdRef.current += 1;
    return requestRefs.currentRequestIdRef.current;
  }, [queryClient, requestRefs, syncBackgroundLoading, syncLoading]);
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
