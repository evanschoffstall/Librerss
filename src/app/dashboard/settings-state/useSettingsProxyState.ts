"use client";

import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useState,
} from "react";

import {
  type CompatibilityResult,
  hasConfiguredProxyStatus,
  type ProxyRoutingCheck,
  type ProxySettingsSnapshot,
  type ProxyUIStatus,
} from "@/app/dashboard/dashboard-services";
import {
  useClearCompatibilityResults,
  useSettingsProxyActions,
  useSettingsProxyLifecycle,
} from "@/app/dashboard/settings-state/useSettingsProxyState.behavior";
import {
  applyProxySettingsSnapshot,
  useSettingsProxyRequestState,
  useSettingsProxyWritableState,
} from "@/app/dashboard/settings-state/useSettingsProxyState.state";

let cachedProxySettingsSnapshot: null | ProxySettingsSnapshot = null;

/** Stable state contract consumed by the dashboard proxy settings surface. */
export interface UseSettingsProxyStateResult {
  allowInsecureTls: boolean;
  compatibilityCheckedAt: null | number;
  compatibilityError: null | string;
  compatibilityResults: CompatibilityResult[] | null;
  error: null | string;
  handleClear: () => Promise<void>;
  handleRunCompatibilityCheck: () => Promise<void>;
  handleSave: () => Promise<void>;
  hasProxy: boolean;
  hasProxyPassword: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  isInitialProxyLoadPending: boolean;
  isRunningCompatibilityCheck: boolean;
  nowTs: number;
  proxyPassword: string;
  proxyRoutingCheck: null | ProxyRoutingCheck;
  proxyStatus: ProxyUIStatus;
  proxyUrl: string;
  proxyUsername: string;
  resultsRef: RefObject<HTMLDivElement | null>;
  saving: boolean;
  setAllowInsecureTls: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<null | string>>;
  setProxyPassword: Dispatch<SetStateAction<string>>;
  setProxyUrl: Dispatch<SetStateAction<string>>;
  setProxyUsername: Dispatch<SetStateAction<string>>;
  syncAllowInsecureTls: (checked: boolean) => Promise<void>;
}

interface UseSettingsProxyStateOptions {
  enabled?: boolean;
}

/**
 * Owns dashboard proxy settings state and rejects stale async completions when
 * newer user intent supersedes an older load, save, clear, or check request.
 * @param options
 */
export function useSettingsProxyState(
  options: UseSettingsProxyStateOptions = {},
): UseSettingsProxyStateResult {
  const isEnabled = options.enabled ?? true;
  const [initialSnapshot] = useState<null | ProxySettingsSnapshot>(() =>
    isEnabled ? cachedProxySettingsSnapshot : null,
  );
  const proxyState = useSettingsProxyWritableState(isEnabled, initialSnapshot);
  const requestState = useSettingsProxyRequestState();
  const { isRunningCompatibilityCheck, saving } =
    resolveProxyRequestStatuses(requestState);
  const applyProxySettings = useApplyProxySettings(proxyState);
  useSettingsProxyLifecycle({
    applyProxySettings,
    hasCachedSnapshot: initialSnapshot !== null,
    isEnabled,
    proxyState,
    requestState,
  });
  const hasProxy = hasConfiguredProxyStatus(proxyState.proxyStatus);
  const clearCompatibilityResults = useClearCompatibilityResults(proxyState);
  const {
    handleClear,
    handleRunCompatibilityCheck,
    handleSave,
    syncAllowInsecureTls,
  } = useSettingsProxyActions({
    applyProxySettings,
    clearCompatibilityResults,
    hasProxy,
    proxyState,
    requestState,
  });

  return buildUseSettingsProxyStateResult({
    handleClear,
    handleRunCompatibilityCheck,
    handleSave,
    hasProxy,
    isRunningCompatibilityCheck,
    proxyState,
    saving,
    syncAllowInsecureTls,
  });
}

/**
 * @param root0
 * @param root0.handleClear
 * @param root0.handleRunCompatibilityCheck
 * @param root0.handleSave
 * @param root0.hasProxy
 * @param root0.isRunningCompatibilityCheck
 * @param root0.proxyState
 * @param root0.saving
 * @param root0.syncAllowInsecureTls
 */
function buildUseSettingsProxyStateResult({
  handleClear,
  handleRunCompatibilityCheck,
  handleSave,
  hasProxy,
  isRunningCompatibilityCheck,
  proxyState,
  saving,
  syncAllowInsecureTls,
}: {
  handleClear: () => Promise<void>;
  handleRunCompatibilityCheck: () => Promise<void>;
  handleSave: () => Promise<void>;
  hasProxy: boolean;
  isRunningCompatibilityCheck: boolean;
  proxyState: ReturnType<typeof useSettingsProxyWritableState>;
  saving: boolean;
  syncAllowInsecureTls: (checked: boolean) => Promise<void>;
}): UseSettingsProxyStateResult {
  return {
    allowInsecureTls: proxyState.allowInsecureTls,
    compatibilityCheckedAt: proxyState.compatibilityCheckedAt,
    compatibilityError: proxyState.compatibilityError,
    compatibilityResults: proxyState.compatibilityResults,
    error: proxyState.error,
    handleClear,
    handleRunCompatibilityCheck,
    handleSave,
    hasProxy,
    hasProxyPassword: proxyState.hasProxyPassword,
    inputRef: proxyState.inputRef,
    isInitialProxyLoadPending: proxyState.isInitialProxyLoadPending,
    isRunningCompatibilityCheck,
    nowTs: proxyState.nowTs,
    proxyPassword: proxyState.proxyPassword,
    proxyRoutingCheck: proxyState.proxyRoutingCheck,
    proxyStatus: proxyState.proxyStatus,
    proxyUrl: proxyState.proxyUrl,
    proxyUsername: proxyState.proxyUsername,
    resultsRef: proxyState.resultsRef,
    saving,
    setAllowInsecureTls: proxyState.setAllowInsecureTls,
    setError: proxyState.setError,
    setProxyPassword: proxyState.setProxyPassword,
    setProxyUrl: proxyState.setProxyUrl,
    setProxyUsername: proxyState.setProxyUsername,
    syncAllowInsecureTls,
  };
}

/**
 * @param requestState
 */
function resolveProxyRequestStatuses(
  requestState: ReturnType<typeof useSettingsProxyRequestState>,
) {
  return {
    isRunningCompatibilityCheck:
      requestState.activeCompatibilityRequestId !== null,
    saving: requestState.activeProxyMutationRequestId !== null,
  };
}

/**
 * @param proxyState
 */
function useApplyProxySettings(
  proxyState: ReturnType<typeof useSettingsProxyWritableState>,
) {
  const {
    setAllowInsecureTls,
    setError,
    setHasProxyPassword,
    setIsInitialProxyLoadPending,
    setProxyRoutingCheck,
    setProxyStatus,
    setProxyUrl,
    setProxyUsername,
  } = proxyState;

  return useCallback(
    (snapshot: ProxySettingsSnapshot) => {
      cachedProxySettingsSnapshot = snapshot;
      setIsInitialProxyLoadPending(false);
      applyProxySettingsSnapshot({
        setAllowInsecureTls,
        setError,
        setHasProxyPassword,
        setProxyRoutingCheck,
        setProxyStatus,
        setProxyUrl,
        setProxyUsername,
        snapshot,
      });
    },
    [
      setAllowInsecureTls,
      setError,
      setHasProxyPassword,
      setIsInitialProxyLoadPending,
      setProxyRoutingCheck,
      setProxyStatus,
      setProxyUrl,
      setProxyUsername,
    ],
  );
}
