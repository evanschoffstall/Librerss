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

interface HandleRunCompatibilityCheckOptions {
  hasProxy: boolean;
  proxyState: SettingsProxyWritableState;
  requestState: SettingsProxyRequestState;
}

interface LoadProxySettingsOptions {
  applyProxySettings: (snapshot: ProxySettingsSnapshot) => void;
  hasCachedSnapshot: boolean;
  isEnabled: boolean;
  proxyState: SettingsProxyWritableState;
  requestState: SettingsProxyRequestState;
}
interface ProxyMutationHandlerOptions {
  applyProxySettings: (snapshot: ProxySettingsSnapshot) => void;
  clearCompatibilityResults: () => void;
  proxyState: SettingsProxyWritableState;
  requestState: SettingsProxyRequestState;
}

interface SettingsProxyActionsOptions {
  applyProxySettings: (snapshot: ProxySettingsSnapshot) => void;
  clearCompatibilityResults: () => void;
  hasProxy: boolean;
  proxyState: SettingsProxyWritableState;
  requestState: SettingsProxyRequestState;
}
interface SettingsProxyLifecycleOptions {
  applyProxySettings: (snapshot: ProxySettingsSnapshot) => void;
  hasCachedSnapshot: boolean;
  isEnabled: boolean;
  proxyState: SettingsProxyWritableState;
  requestState: SettingsProxyRequestState;
}

interface SyncAllowInsecureTlsOptions {
  applyProxySettings: (snapshot: ProxySettingsSnapshot) => void;
  proxyState: SettingsProxyWritableState;
  requestState: SettingsProxyRequestState;
}

/**
 * Manage the clear compatibility results.
 * @param proxyState - The proxy state.
 * @returns The clear compatibility results state and callbacks.
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
 * Manage the settings proxy actions.
 * @param options - The options used to manage the settings proxy actions.
 * @returns The settings proxy actions state and callbacks.
 */
export function useSettingsProxyActions(options: SettingsProxyActionsOptions) {
  const {
    applyProxySettings,
    clearCompatibilityResults,
    hasProxy,
    proxyState,
    requestState,
  } = options;
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
 * Manage the settings proxy lifecycle.
 * @param options - The options used to manage the settings proxy lifecycle.
 */
export function useSettingsProxyLifecycle(
  options: SettingsProxyLifecycleOptions,
) {
  const {
    applyProxySettings,
    hasCachedSnapshot,
    isEnabled,
    proxyState,
    requestState,
  } = options;
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
 * Create the handle clear.
 * @param options - The options used to create the handle clear.
 * @returns The handle clear.
 */
function createHandleClear(options: ProxyMutationHandlerOptions) {
  const {
    applyProxySettings,
    clearCompatibilityResults,
    proxyState,
    requestState,
  } = options;
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
 * Create the handle run compatibility check.
 * @param options - The options used to create the handle run compatibility check.
 * @returns The handle run compatibility check.
 */
function createHandleRunCompatibilityCheck(
  options: HandleRunCompatibilityCheckOptions,
) {
  const { hasProxy, proxyState, requestState } = options;
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
 * Create the handle save.
 * @param options - The options used to create the handle save.
 * @returns The handle save.
 */
function createHandleSave(options: ProxyMutationHandlerOptions) {
  const {
    applyProxySettings,
    clearCompatibilityResults,
    proxyState,
    requestState,
  } = options;
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
 * Create the sync allow insecure tls.
 * @param options - The options used to create the sync allow insecure tls.
 * @returns The sync allow insecure tls.
 */
function createSyncAllowInsecureTls(options: SyncAllowInsecureTlsOptions) {
  const { applyProxySettings, proxyState, requestState } = options;
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
 * Manage the hydrate compatibility cache.
 * @param proxyState - The proxy state.
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
 * Manage the load proxy settings.
 * @param options - The options used to manage the load proxy settings.
 */
function useLoadProxySettings(options: LoadProxySettingsOptions) {
  const {
    applyProxySettings,
    hasCachedSnapshot,
    isEnabled,
    proxyState,
    requestState,
  } = options;
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
 * Manage the proxy now clock.
 * @param proxyState - The proxy state.
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
 * Manage the proxy results auto scroll.
 * @param proxyState - The proxy state.
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
