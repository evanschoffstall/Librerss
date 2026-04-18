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
 * @param root0
 * @param root0.setAllowInsecureTls
 * @param root0.setError
 * @param root0.setHasProxyPassword
 * @param root0.setProxyRoutingCheck
 * @param root0.setProxyStatus
 * @param root0.setProxyUrl
 * @param root0.setProxyUsername
 * @param root0.snapshot
 */
export function applyProxySettingsSnapshot({
  setAllowInsecureTls,
  setError,
  setHasProxyPassword,
  setProxyRoutingCheck,
  setProxyStatus,
  setProxyUrl,
  setProxyUsername,
  snapshot,
}: {
  setAllowInsecureTls: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<null | string>>;
  setHasProxyPassword: Dispatch<SetStateAction<boolean>>;
  setProxyRoutingCheck: Dispatch<SetStateAction<null | ProxyRoutingCheck>>;
  setProxyStatus: Dispatch<SetStateAction<ProxyUIStatus>>;
  setProxyUrl: Dispatch<SetStateAction<string>>;
  setProxyUsername: Dispatch<SetStateAction<string>>;
  snapshot: ProxySettingsSnapshot;
}) {
  setProxyUrl(snapshot.proxyUrl);
  setAllowInsecureTls(snapshot.allowInsecureTls);
  setProxyUsername(snapshot.proxyUsername);
  setHasProxyPassword(snapshot.hasProxyPassword);
  setProxyRoutingCheck(snapshot.routingCheck);
  setProxyStatus(snapshot.proxyStatus);
  setError(snapshot.error);
}

/**
 *
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
 * @param isEnabled
 * @param initialSnapshot
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
 *
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
 * @param isEnabled
 * @param initialSnapshot
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
