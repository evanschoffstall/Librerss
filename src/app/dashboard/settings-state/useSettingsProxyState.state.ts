"use client";

import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type CompatibilityResult,
  type ProxyRoutingCheck,
  type ProxySettingsSnapshot,
  type ProxyUIStatus,
} from "@/app/dashboard/dashboard-services";

/**
 * Describes the settings proxy request state.
 */
export interface SettingsProxyRequestState {
  activeCompatibilityRequestId: null | number;
  activeProxyMutationRequestId: null | number;
  isCurrentCompatibilityRequest: (requestId: number) => boolean;
  isCurrentProxyRequest: (requestId: number) => boolean;
  isMountedRef: RefObject<boolean>;
  latestCompatibilityRequestIdRef: RefObject<number>;
  latestProxyRequestIdRef: RefObject<number>;
  setActiveCompatibilityRequestId: Dispatch<SetStateAction<null | number>>;
  setActiveProxyMutationRequestId: Dispatch<SetStateAction<null | number>>;
  startCompatibilityRequest: () => number;
  startProxyRequest: () => number;
}

/**
 * Describes the settings proxy writable state.
 */
export interface SettingsProxyWritableState {
  allowInsecureTls: boolean;
  compatibilityCheckedAt: null | number;
  compatibilityError: null | string;
  compatibilityResults: CompatibilityResult[] | null;
  error: null | string;
  hasProxyPassword: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  isInitialProxyLoadPending: boolean;
  nowTs: number;
  proxyPassword: string;
  proxyRoutingCheck: null | ProxyRoutingCheck;
  proxyStatus: ProxyUIStatus;
  proxyUrl: string;
  proxyUsername: string;
  resultsRef: RefObject<HTMLDivElement | null>;
  setAllowInsecureTls: Dispatch<SetStateAction<boolean>>;
  setCompatibilityCheckedAt: Dispatch<SetStateAction<null | number>>;
  setCompatibilityError: Dispatch<SetStateAction<null | string>>;
  setCompatibilityResults: Dispatch<
    SetStateAction<CompatibilityResult[] | null>
  >;
  setError: Dispatch<SetStateAction<null | string>>;
  setHasProxyPassword: Dispatch<SetStateAction<boolean>>;
  setIsInitialProxyLoadPending: Dispatch<SetStateAction<boolean>>;
  setNowTs: Dispatch<SetStateAction<number>>;
  setProxyPassword: Dispatch<SetStateAction<string>>;
  setProxyRoutingCheck: Dispatch<SetStateAction<null | ProxyRoutingCheck>>;
  setProxyStatus: Dispatch<SetStateAction<ProxyUIStatus>>;
  setProxyUrl: Dispatch<SetStateAction<string>>;
  setProxyUsername: Dispatch<SetStateAction<string>>;
  shouldAutoScrollToResultsRef: RefObject<boolean>;
}
/**
 * Describes the options for apply proxy settings snapshot.
 */
interface ApplyProxySettingsSnapshotOptions {
  setAllowInsecureTls: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<null | string>>;
  setHasProxyPassword: Dispatch<SetStateAction<boolean>>;
  setProxyRoutingCheck: Dispatch<SetStateAction<null | ProxyRoutingCheck>>;
  setProxyStatus: Dispatch<SetStateAction<ProxyUIStatus>>;
  setProxyUrl: Dispatch<SetStateAction<string>>;
  setProxyUsername: Dispatch<SetStateAction<string>>;
  snapshot: ProxySettingsSnapshot;
}

/**
 * Process the apply proxy settings snapshot.
 * @param options - The options used to process the apply proxy settings snapshot.
 */
export function applyProxySettingsSnapshot(
  options: ApplyProxySettingsSnapshotOptions,
) {
  const {
    setAllowInsecureTls,
    setError,
    setHasProxyPassword,
    setProxyRoutingCheck,
    setProxyStatus,
    setProxyUrl,
    setProxyUsername,
    snapshot,
  } = options;
  setProxyUrl(snapshot.proxyUrl);
  setAllowInsecureTls(snapshot.allowInsecureTls);
  setProxyUsername(snapshot.proxyUsername);
  setHasProxyPassword(snapshot.hasProxyPassword);
  setProxyRoutingCheck(snapshot.routingCheck);
  setProxyStatus(snapshot.proxyStatus);
  setError(snapshot.error);
}

/**
 * Manage the settings proxy request state.
 * @returns The settings proxy request state state and callbacks.
 */
export function useSettingsProxyRequestState(): SettingsProxyRequestState {
  const isMountedRef = useRef(true);
  const latestProxyRequestIdRef = useRef(0);
  const latestCompatibilityRequestIdRef = useRef(0);
  const [activeProxyMutationRequestId, setActiveProxyMutationRequestId] =
    useState<null | number>(null);
  const [activeCompatibilityRequestId, setActiveCompatibilityRequestId] =
    useState<null | number>(null);

  const startProxyRequest = useCallback(() => {
    const requestId = latestProxyRequestIdRef.current + 1;
    latestProxyRequestIdRef.current = requestId;
    return requestId;
  }, []);
  const startCompatibilityRequest = useCallback(() => {
    const requestId = latestCompatibilityRequestIdRef.current + 1;
    latestCompatibilityRequestIdRef.current = requestId;
    return requestId;
  }, []);
  const isCurrentCompatibilityRequest = useCallback(
    (requestId: number) =>
      isMountedRef.current &&
      latestCompatibilityRequestIdRef.current === requestId,
    [],
  );
  const isCurrentProxyRequest = useCallback(
    (requestId: number) =>
      isMountedRef.current && latestProxyRequestIdRef.current === requestId,
    [],
  );

  return useMemo(
    () => ({
      activeCompatibilityRequestId,
      activeProxyMutationRequestId,
      isCurrentCompatibilityRequest,
      isCurrentProxyRequest,
      isMountedRef,
      latestCompatibilityRequestIdRef,
      latestProxyRequestIdRef,
      setActiveCompatibilityRequestId,
      setActiveProxyMutationRequestId,
      startCompatibilityRequest,
      startProxyRequest,
    }),
    [
      activeCompatibilityRequestId,
      activeProxyMutationRequestId,
      isCurrentCompatibilityRequest,
      isCurrentProxyRequest,
      startCompatibilityRequest,
      startProxyRequest,
    ],
  );
}

/**
 * Manage the settings proxy writable state.
 * @param isEnabled - Whether is enabled.
 * @param initialSnapshot - The initial snapshot.
 * @returns The settings proxy writable state state and callbacks.
 */
export function useSettingsProxyWritableState(
  isEnabled: boolean,
  initialSnapshot: null | ProxySettingsSnapshot,
): SettingsProxyWritableState {
  const formState = useSettingsProxyFormState(isEnabled, initialSnapshot);
  const compatibilityState = useSettingsProxyCompatibilityState();

  return {
    ...formState,
    ...compatibilityState,
  };
}

/**
 * Manage the settings proxy compatibility state.
 * @returns The settings proxy compatibility state state and callbacks.
 */
function useSettingsProxyCompatibilityState() {
  const [compatibilityResults, setCompatibilityResults] = useState<
    CompatibilityResult[] | null
  >(null);
  const [compatibilityError, setCompatibilityError] = useState<null | string>(
    null,
  );
  const [compatibilityCheckedAt, setCompatibilityCheckedAt] = useState<
    null | number
  >(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const resultsRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollToResultsRef = useRef(false);

  return {
    compatibilityCheckedAt,
    compatibilityError,
    compatibilityResults,
    nowTs,
    resultsRef,
    setCompatibilityCheckedAt,
    setCompatibilityError,
    setCompatibilityResults,
    setNowTs,
    shouldAutoScrollToResultsRef,
  };
}

/**
 * Manage the settings proxy form state.
 * @param isEnabled - Whether is enabled.
 * @param initialSnapshot - The initial snapshot.
 * @returns The settings proxy form state state and callbacks.
 */
function useSettingsProxyFormState(
  isEnabled: boolean,
  initialSnapshot: null | ProxySettingsSnapshot,
) {
  const [proxyUrl, setProxyUrl] = useState(
    () => initialSnapshot?.proxyUrl ?? "",
  );
  const [proxyStatus, setProxyStatus] = useState<ProxyUIStatus>(
    () => initialSnapshot?.proxyStatus ?? (isEnabled ? "loading" : "none"),
  );
  const [error, setError] = useState<null | string>(
    () => initialSnapshot?.error ?? null,
  );
  const [allowInsecureTls, setAllowInsecureTls] = useState(
    () => initialSnapshot?.allowInsecureTls ?? false,
  );
  const [proxyUsername, setProxyUsername] = useState(
    () => initialSnapshot?.proxyUsername ?? "",
  );
  const [proxyPassword, setProxyPassword] = useState("");
  const [hasProxyPassword, setHasProxyPassword] = useState(
    () => initialSnapshot?.hasProxyPassword ?? false,
  );
  const [proxyRoutingCheck, setProxyRoutingCheck] =
    useState<null | ProxyRoutingCheck>(
      () => initialSnapshot?.routingCheck ?? null,
    );
  const [isInitialProxyLoadPending, setIsInitialProxyLoadPending] = useState(
    isEnabled && initialSnapshot === null,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  return {
    allowInsecureTls,
    error,
    hasProxyPassword,
    inputRef,
    isInitialProxyLoadPending,
    proxyPassword,
    proxyRoutingCheck,
    proxyStatus,
    proxyUrl,
    proxyUsername,
    setAllowInsecureTls,
    setError,
    setHasProxyPassword,
    setIsInitialProxyLoadPending,
    setProxyPassword,
    setProxyRoutingCheck,
    setProxyStatus,
    setProxyUrl,
    setProxyUsername,
  };
}
