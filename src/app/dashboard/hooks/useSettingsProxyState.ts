"use client";

import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";

import { ArticleService } from "@/lib";

import {
  clearCompatibilityResultsCache,
  type CompatibilityResult,
  hasConfiguredProxyStatus,
  normalizeCompatibilityResults,
  type ProxySettingsSnapshot,
  type ProxyUIStatus,
  readCompatibilityResultsCache,
  toProxySettingsSnapshot,
  writeCompatibilityResultsCache,
} from "../services/settings-proxy";

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
  isRunningCompatibilityCheck: boolean;
  nowTs: number;
  proxyPassword: string;
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
 * Owns dashboard proxy settings state and rejects stale async completions when
 * newer user intent supersedes an older load, save, clear, or check request.
 */
export function useSettingsProxyState(): UseSettingsProxyStateResult {
  const [proxyUrl, setProxyUrl] = useState("");
  const [proxyStatus, setProxyStatus] = useState<ProxyUIStatus>("loading");
  const [error, setError] = useState<null | string>(null);
  const [allowInsecureTls, setAllowInsecureTls] = useState(false);
  const [proxyUsername, setProxyUsername] = useState("");
  const [proxyPassword, setProxyPassword] = useState("");
  const [hasProxyPassword, setHasProxyPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [compatibilityResults, setCompatibilityResults] =
    useState<CompatibilityResult[] | null>(null);
  const [compatibilityError, setCompatibilityError] =
    useState<null | string>(null);
  const [compatibilityCheckedAt, setCompatibilityCheckedAt] =
    useState<null | number>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const resultsRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollToResultsRef = useRef(false);
  const isMountedRef = useRef(true);
  const latestProxyRequestIdRef = useRef(0);
  const latestCompatibilityRequestIdRef = useRef(0);
  const [activeProxyMutationRequestId, setActiveProxyMutationRequestId] =
    useState<null | number>(null);
  const [activeCompatibilityRequestId, setActiveCompatibilityRequestId] =
    useState<null | number>(null);

  const saving = activeProxyMutationRequestId !== null;
  const isRunningCompatibilityCheck = activeCompatibilityRequestId !== null;

  const applyProxySettings = (snapshot: ProxySettingsSnapshot) => {
    applyProxySettingsSnapshot(
      snapshot,
      setAllowInsecureTls,
      setError,
      setHasProxyPassword,
      setProxyStatus,
      setProxyUrl,
      setProxyUsername,
    );
  };

  const startProxyRequest = () => {
    const requestId = latestProxyRequestIdRef.current + 1;
    latestProxyRequestIdRef.current = requestId;
    return requestId;
  };

  const isCurrentProxyRequest = (requestId: number) =>
    isMountedRef.current && latestProxyRequestIdRef.current === requestId;

  const startCompatibilityRequest = () => {
    const requestId = latestCompatibilityRequestIdRef.current + 1;
    latestCompatibilityRequestIdRef.current = requestId;
    return requestId;
  };

  const isCurrentCompatibilityRequest = (requestId: number) =>
    isMountedRef.current && latestCompatibilityRequestIdRef.current === requestId;

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      latestProxyRequestIdRef.current += 1;
      latestCompatibilityRequestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const requestId = startProxyRequest();

    ArticleService.getProxySettings()
      .then((result) => {
        if (!isCurrentProxyRequest(requestId)) {
          return;
        }

        applyProxySettings(toProxySettingsSnapshot(result));
      })
      .catch(() => {
        if (!isCurrentProxyRequest(requestId)) {
          return;
        }

        setProxyStatus("none");
      });
  }, []);

  useEffect(() => {
    const cachedResults = readCompatibilityResultsCache(window.localStorage);
    if (!cachedResults) return;

    setCompatibilityResults(cachedResults.results);
    setCompatibilityCheckedAt(cachedResults.checkedAt);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!compatibilityResults || !shouldAutoScrollToResultsRef.current) return;
    shouldAutoScrollToResultsRef.current = false;
    window.requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    });
  }, [compatibilityResults]);

  const hasProxy = hasConfiguredProxyStatus(proxyStatus);

  const clearCompatibilityResults = () => {
    setCompatibilityResults(null);
    setCompatibilityCheckedAt(null);
    setCompatibilityError(null);
    shouldAutoScrollToResultsRef.current = false;
    try {
      clearCompatibilityResultsCache(window.localStorage);
    } catch {
      // ignore storage errors
    }
  };

  const handleSave = async () => {
    const trimmed = proxyUrl.trim();
    const trimmedUsername = proxyUsername.trim() || null;
    const nextProxyPassword = proxyPassword || null;

    if (!trimmed) return;

    const requestId = startProxyRequest();

    clearCompatibilityResults();
    setActiveProxyMutationRequestId(requestId);
    setError(null);
    setProxyStatus("checking");

    try {
      const result = await ArticleService.saveProxyUrl(trimmed, {
        allowInsecureTls,
        proxyPassword: nextProxyPassword,
        proxyUsername: trimmedUsername,
      });

      if (!isCurrentProxyRequest(requestId)) {
        return;
      }

      applyProxySettings(toProxySettingsSnapshot(result));
      if (nextProxyPassword) {
        setProxyPassword("");
      }
    } catch (err) {
      if (!isCurrentProxyRequest(requestId)) {
        return;
      }

      setError(err instanceof Error ? err.message : "Failed to save proxy URL");
      setProxyStatus("unreachable");
    } finally {
      if (isCurrentProxyRequest(requestId)) {
        setActiveProxyMutationRequestId(null);
      }
    }
  };

  const handleClear = async () => {
    const requestId = startProxyRequest();

    clearCompatibilityResults();
    setActiveProxyMutationRequestId(requestId);
    setError(null);

    try {
      const result = await ArticleService.saveProxyUrl(null, {
        proxyPassword: null,
        proxyUsername: null,
      });

      if (!isCurrentProxyRequest(requestId)) {
        return;
      }

      applyProxySettings(toProxySettingsSnapshot(result));
      setProxyPassword("");
    } catch (err) {
      if (!isCurrentProxyRequest(requestId)) {
        return;
      }

      setError(err instanceof Error ? err.message : "Failed to clear proxy URL");
    } finally {
      if (isCurrentProxyRequest(requestId)) {
        setActiveProxyMutationRequestId(null);
      }
    }
  };

  const handleRunCompatibilityCheck = async () => {
    const requestId = startCompatibilityRequest();

    setActiveCompatibilityRequestId(requestId);
    setCompatibilityError(null);
    setError(null);

    try {
      const response = await ArticleService.runProxyCompatibilityCheck({
        useProxy: hasProxy,
      });

      if (!isCurrentCompatibilityRequest(requestId)) {
        return;
      }

      const results = normalizeCompatibilityResults(response.results);
      shouldAutoScrollToResultsRef.current = true;
      setCompatibilityResults(results);
      const checkedAt = Date.now();
      setCompatibilityCheckedAt(checkedAt);
      writeCompatibilityResultsCache(window.localStorage, {
        checkedAt,
        results,
      });
    } catch (err) {
      if (!isCurrentCompatibilityRequest(requestId)) {
        return;
      }

      setCompatibilityError(err instanceof Error ? err.message : "Check failed");
    } finally {
      if (isCurrentCompatibilityRequest(requestId)) {
        setActiveCompatibilityRequestId(null);
      }
    }
  };

  const syncAllowInsecureTls = async (checked: boolean) => {
    const currentUrl = proxyUrl.trim();

    if (!currentUrl) return;

    const requestId = startProxyRequest();

    setActiveProxyMutationRequestId(requestId);
    setAllowInsecureTls(checked);

    try {
      const result = await ArticleService.saveProxyUrl(currentUrl, {
        allowInsecureTls: checked,
      });

      if (!isCurrentProxyRequest(requestId)) {
        return;
      }

      applyProxySettings(toProxySettingsSnapshot(result));
    } catch {
      if (!isCurrentProxyRequest(requestId)) {
        return;
      }

      setAllowInsecureTls(!checked);
    } finally {
      if (isCurrentProxyRequest(requestId)) {
        setActiveProxyMutationRequestId(null);
      }
    }
  };

  return {
    allowInsecureTls,
    compatibilityCheckedAt,
    compatibilityError,
    compatibilityResults,
    error,
    handleClear,
    handleRunCompatibilityCheck,
    handleSave,
    hasProxy,
    hasProxyPassword,
    inputRef,
    isRunningCompatibilityCheck,
    nowTs,
    proxyPassword,
    proxyStatus,
    proxyUrl,
    proxyUsername,
    resultsRef,
    saving,
    setAllowInsecureTls,
    setError,
    setProxyPassword,
    setProxyUrl,
    setProxyUsername,
    syncAllowInsecureTls,
  };
}

/** Applies one normalized proxy snapshot onto the hook's writable state. */
function applyProxySettingsSnapshot(
  snapshot: ProxySettingsSnapshot,
  setAllowInsecureTls: Dispatch<SetStateAction<boolean>>,
  setError: Dispatch<SetStateAction<null | string>>,
  setHasProxyPassword: Dispatch<SetStateAction<boolean>>,
  setProxyStatus: Dispatch<SetStateAction<ProxyUIStatus>>,
  setProxyUrl: Dispatch<SetStateAction<string>>,
  setProxyUsername: Dispatch<SetStateAction<string>>,
) {
  setProxyUrl(snapshot.proxyUrl);
  setAllowInsecureTls(snapshot.allowInsecureTls);
  setProxyUsername(snapshot.proxyUsername);
  setHasProxyPassword(snapshot.hasProxyPassword);
  setProxyStatus(snapshot.proxyStatus);
  setError(snapshot.error);
}