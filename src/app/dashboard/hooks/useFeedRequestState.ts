"use client";

import { useCallback, useRef, useState } from "react";

interface BeginFeedRequestOptions {
  forceRefresh: boolean;
  isBackground: boolean;
  requestSignature: string;
}

type BeginFeedRequestResult =
  | {
      abortController: AbortController;
      requestId: number;
      skippedDuplicate: false;
    }
  | {
      requestId: number;
      skippedDuplicate: true;
    };

interface UseFeedRequestStateOptions {
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useFeedRequestState({
  setLoading,
}: UseFeedRequestStateOptions) {
  const currentRequestIdRef = useRef(0);
  const activeRequestSignatureRef = useRef<null | string>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
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

  const beginRequest = useCallback(
    ({
      forceRefresh,
      isBackground,
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

      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      activeRequestSignatureRef.current = requestSignature;

      if (!isBackground) {
        syncLoading(true);
        setLoadingEpoch((epoch) => epoch + 1);
      }

      return {
        abortController,
        requestId,
        skippedDuplicate: false,
      };
    },
    [syncLoading],
  );

  const cancelPendingRequest = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    activeRequestSignatureRef.current = null;
    currentRequestIdRef.current += 1;
    syncLoading(false);
    return currentRequestIdRef.current;
  }, [syncLoading]);

  const finishRequest = useCallback(
    (requestId: number) => {
      if (currentRequestIdRef.current !== requestId) {
        return;
      }

      activeRequestSignatureRef.current = null;
      syncLoading(false);
    },
    [syncLoading],
  );

  const isCurrentRequest = useCallback(
    (requestId: number) => currentRequestIdRef.current === requestId,
    [],
  );

  const isLoading = useCallback(() => loadingRef.current, []);

  return {
    beginRequest,
    cancelPendingRequest,
    finishRequest,
    isCurrentRequest,
    isLoading,
    loading,
    loadingEpoch,
  };
}
