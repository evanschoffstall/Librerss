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

/**
 * Describes the options for use settings proxy state.
 */
interface UseSettingsProxyStateOptions {
  enabled?: boolean;
}

/**
 * Describes the options for use settings proxy state result.
 */
interface UseSettingsProxyStateResultOptions {
  handleClear: () => Promise<void>;
  handleRunCompatibilityCheck: () => Promise<void>;
  handleSave: () => Promise<void>;
  hasProxy: boolean;
  isRunningCompatibilityCheck: boolean;
  proxyState: ReturnType<typeof useSettingsProxyWritableState>;
  saving: boolean;
  syncAllowInsecureTls: (checked: boolean) => Promise<void>;
}
/**
 * Manage the settings proxy state.
 * @param options - The options used to manage the settings proxy state.
 * @returns The settings proxy state state and callbacks.
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
 * Build the use settings proxy state result.
 * @param options - The options used to build the use settings proxy state result.
 * @returns The use settings proxy state result.
 */
function buildUseSettingsProxyStateResult(
  options: UseSettingsProxyStateResultOptions,
): UseSettingsProxyStateResult {
  const {
    handleClear,
    handleRunCompatibilityCheck,
    handleSave,
    hasProxy,
    isRunningCompatibilityCheck,
    proxyState,
    saving,
    syncAllowInsecureTls,
  } = options;
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
 * Resolve the proxy request statuses.
 * @param requestState - The request state.
 * @returns The proxy request statuses.
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
 * Manage the apply proxy settings.
 * @param proxyState - The proxy state.
 * @returns The apply proxy settings state and callbacks.
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
