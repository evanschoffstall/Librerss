"use client";

import { useEffect } from "react";

import {
  clearCompatibilityResultsCache,
  normalizeCompatibilityResults,
  type ProxySettingsSnapshot,
  readCompatibilityResultsCache,
  toProxySettingsSnapshot,
  writeCompatibilityResultsCache,
} from "@/app/dashboard/dashboard-services";
import {
  type SettingsProxyRequestState,
  type SettingsProxyWritableState,
} from "@/app/dashboard/settings-state/useSettingsProxyState.state";
import { ArticleService } from "@/lib/api";

interface ProxyMutationHandlerOptions {
  applyProxySettings: (snapshot: ProxySettingsSnapshot) => void;
  clearCompatibilityResults: () => void;
  proxyState: SettingsProxyWritableState;
  requestState: SettingsProxyRequestState;
}

/**
 * @param proxyState
 */
export function useClearCompatibilityResults(
  proxyState: SettingsProxyWritableState,
) {
  return () => {
    proxyState.setCompatibilityResults(null);
    proxyState.setCompatibilityCheckedAt(null);
    proxyState.setCompatibilityError(null);
    proxyState.shouldAutoScrollToResultsRef.current = false;

    try {
      clearCompatibilityResultsCache(window.localStorage);
    } catch {
      // ignore storage errors
    }
  };
}

/**
 * @param root0
 * @param root0.applyProxySettings
 * @param root0.clearCompatibilityResults
 * @param root0.hasProxy
 * @param root0.proxyState
 * @param root0.requestState
 */
export function useSettingsProxyActions({
  applyProxySettings,
  clearCompatibilityResults,
  hasProxy,
  proxyState,
  requestState,
}: {
  applyProxySettings: (snapshot: ProxySettingsSnapshot) => void;
  clearCompatibilityResults: () => void;
  hasProxy: boolean;
  proxyState: SettingsProxyWritableState;
  requestState: SettingsProxyRequestState;
}) {
  return {
    handleClear: createHandleClear({
      applyProxySettings,
      clearCompatibilityResults,
      proxyState,
      requestState,
    }),
    handleRunCompatibilityCheck: createHandleRunCompatibilityCheck({
      hasProxy,
      proxyState,
      requestState,
    }),
    handleSave: createHandleSave({
      applyProxySettings,
      clearCompatibilityResults,
      proxyState,
      requestState,
    }),
    syncAllowInsecureTls: createSyncAllowInsecureTls({
      applyProxySettings,
      proxyState,
      requestState,
    }),
  };
}

/**
 * @param root0
 * @param root0.applyProxySettings
 * @param root0.hasCachedSnapshot
 * @param root0.isEnabled
 * @param root0.proxyState
 * @param root0.requestState
 */
export function useSettingsProxyLifecycle({
  applyProxySettings,
  hasCachedSnapshot,
  isEnabled,
  proxyState,
  requestState,
}: {
  applyProxySettings: (snapshot: ProxySettingsSnapshot) => void;
  hasCachedSnapshot: boolean;
  isEnabled: boolean;
  proxyState: SettingsProxyWritableState;
  requestState: SettingsProxyRequestState;
}) {
  useEffect(() => {
    requestState.isMountedRef.current = true;
    return () => {
      requestState.isMountedRef.current = false;
      requestState.latestProxyRequestIdRef.current += 1;
      requestState.latestCompatibilityRequestIdRef.current += 1;
    };
  }, [
    requestState.isMountedRef,
    requestState.latestCompatibilityRequestIdRef,
    requestState.latestProxyRequestIdRef,
  ]);

  useLoadProxySettings({
    applyProxySettings,
    hasCachedSnapshot,
    isEnabled,
    proxyState,
    requestState,
  });
  useHydrateCompatibilityCache(proxyState);
  useProxyNowClock(proxyState);
  useProxyResultsAutoScroll(proxyState);
}

/**
 * @param root0
 * @param root0.applyProxySettings
 * @param root0.clearCompatibilityResults
 * @param root0.proxyState
 * @param root0.requestState
 */
function createHandleClear({
  applyProxySettings,
  clearCompatibilityResults,
  proxyState,
  requestState,
}: ProxyMutationHandlerOptions) {
  return async () => {
    const requestId = requestState.startProxyRequest();
    clearCompatibilityResults();
    requestState.setActiveProxyMutationRequestId(requestId);
    proxyState.setError(null);
    proxyState.setProxyRoutingCheck(null);

    try {
      const result = await ArticleService.saveProxyUrl(null, {
        proxyPassword: null,
        proxyUsername: null,
      });
      if (!requestState.isCurrentProxyRequest(requestId)) {
        return;
      }
      applyProxySettings(toProxySettingsSnapshot(result));
      proxyState.setProxyPassword("");
    } catch (err) {
      if (!requestState.isCurrentProxyRequest(requestId)) {
        return;
      }
      proxyState.setError(
        err instanceof Error ? err.message : "Failed to clear proxy URL",
      );
    } finally {
      if (requestState.isCurrentProxyRequest(requestId)) {
        requestState.setActiveProxyMutationRequestId(null);
      }
    }
  };
}

/**
 * @param root0
 * @param root0.hasProxy
 * @param root0.proxyState
 * @param root0.requestState
 */
function createHandleRunCompatibilityCheck({
  hasProxy,
  proxyState,
  requestState,
}: {
  hasProxy: boolean;
  proxyState: SettingsProxyWritableState;
  requestState: SettingsProxyRequestState;
}) {
  return async () => {
    const requestId = requestState.startCompatibilityRequest();
    requestState.setActiveCompatibilityRequestId(requestId);
    proxyState.setCompatibilityError(null);
    proxyState.setError(null);

    try {
      const response = await ArticleService.runProxyCompatibilityCheck({
        useProxy: hasProxy,
      });
      if (!requestState.isCurrentCompatibilityRequest(requestId)) {
        return;
      }
      const results = normalizeCompatibilityResults(response.results);
      const checkedAt = Date.now();
      proxyState.shouldAutoScrollToResultsRef.current = true;
      proxyState.setCompatibilityResults(results);
      proxyState.setCompatibilityCheckedAt(checkedAt);
      writeCompatibilityResultsCache(window.localStorage, {
        checkedAt,
        results,
      });
    } catch (err) {
      if (!requestState.isCurrentCompatibilityRequest(requestId)) {
        return;
      }
      proxyState.setCompatibilityError(
        err instanceof Error ? err.message : "Check failed",
      );
    } finally {
      if (requestState.isCurrentCompatibilityRequest(requestId)) {
        requestState.setActiveCompatibilityRequestId(null);
      }
    }
  };
}

/**
 * @param root0
 * @param root0.applyProxySettings
 * @param root0.clearCompatibilityResults
 * @param root0.proxyState
 * @param root0.requestState
 */
function createHandleSave({
  applyProxySettings,
  clearCompatibilityResults,
  proxyState,
  requestState,
}: ProxyMutationHandlerOptions) {
  return async () => {
    const trimmed = proxyState.proxyUrl.trim();
    const trimmedUsername = proxyState.proxyUsername.trim() || null;
    const nextProxyPassword = proxyState.proxyPassword || null;

    if (!trimmed) {
      return;
    }

    const requestId = requestState.startProxyRequest();
    clearCompatibilityResults();
    requestState.setActiveProxyMutationRequestId(requestId);
    proxyState.setError(null);
    proxyState.setProxyRoutingCheck(null);
    proxyState.setProxyStatus("checking");

    try {
      const result = await ArticleService.saveProxyUrl(trimmed, {
        allowInsecureTls: proxyState.allowInsecureTls,
        proxyPassword: nextProxyPassword,
        proxyUsername: trimmedUsername,
      });
      if (!requestState.isCurrentProxyRequest(requestId)) {
        return;
      }
      applyProxySettings(toProxySettingsSnapshot(result));
      if (nextProxyPassword) {
        proxyState.setProxyPassword("");
      }
    } catch (err) {
      if (!requestState.isCurrentProxyRequest(requestId)) {
        return;
      }
      proxyState.setError(
        err instanceof Error ? err.message : "Failed to save proxy URL",
      );
      proxyState.setProxyStatus("unreachable");
    } finally {
      if (requestState.isCurrentProxyRequest(requestId)) {
        requestState.setActiveProxyMutationRequestId(null);
      }
    }
  };
}

/**
 * @param root0
 * @param root0.applyProxySettings
 * @param root0.proxyState
 * @param root0.requestState
 */
function createSyncAllowInsecureTls({
  applyProxySettings,
  proxyState,
  requestState,
}: {
  applyProxySettings: (snapshot: ProxySettingsSnapshot) => void;
  proxyState: SettingsProxyWritableState;
  requestState: SettingsProxyRequestState;
}) {
  return async (checked: boolean) => {
    const currentUrl = proxyState.proxyUrl.trim();
    if (!currentUrl) {
      return;
    }

    const requestId = requestState.startProxyRequest();
    requestState.setActiveProxyMutationRequestId(requestId);
    proxyState.setAllowInsecureTls(checked);
    proxyState.setProxyRoutingCheck(null);
    proxyState.setProxyStatus("checking");

    try {
      const result = await ArticleService.saveProxyUrl(currentUrl, {
        allowInsecureTls: checked,
      });
      if (!requestState.isCurrentProxyRequest(requestId)) {
        return;
      }
      applyProxySettings(toProxySettingsSnapshot(result));
    } catch {
      if (!requestState.isCurrentProxyRequest(requestId)) {
        return;
      }
      proxyState.setAllowInsecureTls(!checked);
      proxyState.setProxyStatus("unreachable");
    } finally {
      if (requestState.isCurrentProxyRequest(requestId)) {
        requestState.setActiveProxyMutationRequestId(null);
      }
    }
  };
}

/**
 * @param proxyState
 */
function useHydrateCompatibilityCache(proxyState: SettingsProxyWritableState) {
  const { setCompatibilityCheckedAt, setCompatibilityResults } = proxyState;
  useEffect(() => {
    const cachedResults = readCompatibilityResultsCache(window.localStorage);
    if (!cachedResults) {
      return;
    }
    setCompatibilityResults(cachedResults.results);
    setCompatibilityCheckedAt(cachedResults.checkedAt);
  }, [setCompatibilityCheckedAt, setCompatibilityResults]);
}

/**
 * @param root0
 * @param root0.applyProxySettings
 * @param root0.hasCachedSnapshot
 * @param root0.isEnabled
 * @param root0.proxyState
 * @param root0.requestState
 */
function useLoadProxySettings({
  applyProxySettings,
  hasCachedSnapshot,
  isEnabled,
  proxyState,
  requestState,
}: {
  applyProxySettings: (snapshot: ProxySettingsSnapshot) => void;
  hasCachedSnapshot: boolean;
  isEnabled: boolean;
  proxyState: SettingsProxyWritableState;
  requestState: SettingsProxyRequestState;
}) {
  const { setIsInitialProxyLoadPending, setProxyRoutingCheck, setProxyStatus } =
    proxyState;
  const { isCurrentProxyRequest, startProxyRequest } = requestState;
  useEffect(() => {
    if (!isEnabled) {
      setIsInitialProxyLoadPending(false);
      return;
    }

    const requestId = startProxyRequest();
    ArticleService.getProxySettings()
      .then((result) => {
        if (isCurrentProxyRequest(requestId)) {
          applyProxySettings(toProxySettingsSnapshot(result));
        }
      })
      .catch(() => {
        if (!isCurrentProxyRequest(requestId)) {
          return;
        }
        setIsInitialProxyLoadPending(false);
        if (hasCachedSnapshot) {
          return;
        }
        setProxyRoutingCheck(null);
        setProxyStatus("none");
      });
  }, [
    applyProxySettings,
    hasCachedSnapshot,
    isEnabled,
    isCurrentProxyRequest,
    setIsInitialProxyLoadPending,
    setProxyRoutingCheck,
    setProxyStatus,
    startProxyRequest,
  ]);
}

/**
 * @param proxyState
 */
function useProxyNowClock(proxyState: SettingsProxyWritableState) {
  const { compatibilityCheckedAt, resultsRef, setNowTs } = proxyState;
  useEffect(() => {
    if (compatibilityCheckedAt === null || resultsRef.current === null) {
      return;
    }

    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 30_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [compatibilityCheckedAt, resultsRef, setNowTs]);
}

/**
 * @param proxyState
 */
function useProxyResultsAutoScroll(proxyState: SettingsProxyWritableState) {
  useEffect(() => {
    if (
      !proxyState.compatibilityResults ||
      !proxyState.shouldAutoScrollToResultsRef.current
    ) {
      return;
    }

    proxyState.shouldAutoScrollToResultsRef.current = false;
    window.requestAnimationFrame(() => {
      proxyState.resultsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    });
  }, [
    proxyState.compatibilityResults,
    proxyState.resultsRef,
    proxyState.shouldAutoScrollToResultsRef,
  ]);
}
