"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

import { ArticleService } from "@/lib";

import {
  COMPATIBILITY_RESULTS_CACHE_KEY,
  type CompatibilityResult,
  type CompatibilityResultsCache,
  isCompatibilityResultsCache,
  type ProxyUIStatus,
} from "../services/settings-proxy";

interface UseSettingsProxyStateResult {
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
  setAllowInsecureTls: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<null | string>>;
  setProxyPassword: React.Dispatch<React.SetStateAction<string>>;
  setProxyUrl: React.Dispatch<React.SetStateAction<string>>;
  setProxyUsername: React.Dispatch<React.SetStateAction<string>>;
  syncAllowInsecureTls: (checked: boolean) => Promise<void>;
}

export function useSettingsProxyState(): UseSettingsProxyStateResult {
  const [proxyUrl, setProxyUrl] = useState("");
  const [proxyStatus, setProxyStatus] = useState<ProxyUIStatus>("loading");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<null | string>(null);
  const [allowInsecureTls, setAllowInsecureTls] = useState(false);
  const [proxyUsername, setProxyUsername] = useState("");
  const [proxyPassword, setProxyPassword] = useState("");
  const [hasProxyPassword, setHasProxyPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isRunningCompatibilityCheck, setIsRunningCompatibilityCheck] =
    useState(false);
  const [compatibilityResults, setCompatibilityResults] =
    useState<CompatibilityResult[] | null>(null);
  const [compatibilityError, setCompatibilityError] =
    useState<null | string>(null);
  const [compatibilityCheckedAt, setCompatibilityCheckedAt] =
    useState<null | number>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const resultsRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollToResultsRef = useRef(false);

  useEffect(() => {
    ArticleService.getProxySettings()
      .then((result) => {
        setProxyUrl(result.proxyUrl ?? "");
        setAllowInsecureTls(result.allowInsecureTls);
        setProxyUsername(result.proxyUsername ?? "");
        setHasProxyPassword(result.hasProxyPassword);
        setProxyStatus(result.proxyUrl === null ? "none" : result.status);
        if (result.error) setError(result.error);
      })
      .catch(() => {
        setProxyStatus("none");
      });
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COMPATIBILITY_RESULTS_CACHE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!isCompatibilityResultsCache(parsed)) return;
      if (
        typeof parsed.checkedAt !== "number" ||
        !Array.isArray(parsed.results)
      ) {
        return;
      }
      setCompatibilityResults(parsed.results);
      setCompatibilityCheckedAt(parsed.checkedAt);
    } catch {
      // ignore malformed cache
    }
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

  const hasProxy =
    proxyStatus === "reachable" ||
    proxyStatus === "unreachable" ||
    proxyStatus === "checking";

  const clearCompatibilityResults = () => {
    setCompatibilityResults(null);
    setCompatibilityCheckedAt(null);
    setCompatibilityError(null);
    shouldAutoScrollToResultsRef.current = false;
    try {
      window.localStorage.removeItem(COMPATIBILITY_RESULTS_CACHE_KEY);
    } catch {
      // ignore storage errors
    }
  };

  const handleSave = async () => {
    const trimmed = proxyUrl.trim();
    if (!trimmed) return;
    clearCompatibilityResults();
    setSaving(true);
    setError(null);
    setProxyStatus("checking");
    try {
      const result = await ArticleService.saveProxyUrl(trimmed, {
        allowInsecureTls,
        proxyPassword: proxyPassword || null,
        proxyUsername: proxyUsername.trim() || null,
      });
      setProxyUrl(result.proxyUrl ?? "");
      setProxyUsername(result.proxyUsername ?? "");
      setHasProxyPassword(result.hasProxyPassword);
      if (proxyPassword) setProxyPassword("");
      if (result.error) {
        setError(result.error);
        setProxyStatus("unreachable");
      } else if (!result.proxyUrl) {
        setProxyStatus("none");
      } else {
        setProxyStatus(result.status);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save proxy URL");
      setProxyStatus("unreachable");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    clearCompatibilityResults();
    setSaving(true);
    setError(null);
    try {
      await ArticleService.saveProxyUrl(null, {
        proxyPassword: null,
        proxyUsername: null,
      });
      setProxyUrl("");
      setProxyUsername("");
      setProxyPassword("");
      setHasProxyPassword(false);
      setProxyStatus("none");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear proxy URL");
    } finally {
      setSaving(false);
    }
  };

  const handleRunCompatibilityCheck = async () => {
    setIsRunningCompatibilityCheck(true);
    setCompatibilityError(null);
    setError(null);
    try {
      const response = await ArticleService.runProxyCompatibilityCheck({
        useProxy: hasProxy,
      });
      shouldAutoScrollToResultsRef.current = true;
      setCompatibilityResults(response.results);
      const checkedAt = Date.now();
      setCompatibilityCheckedAt(checkedAt);
      window.localStorage.setItem(
        COMPATIBILITY_RESULTS_CACHE_KEY,
        JSON.stringify({
          checkedAt,
          results: response.results,
        } satisfies CompatibilityResultsCache),
      );
    } catch (err) {
      setCompatibilityError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setIsRunningCompatibilityCheck(false);
    }
  };

  const syncAllowInsecureTls = async (checked: boolean) => {
    const currentUrl = proxyUrl.trim();
    if (!currentUrl) return;
    setAllowInsecureTls(checked);
    try {
      await ArticleService.saveProxyUrl(currentUrl, {
        allowInsecureTls: checked,
      });
    } catch {
      setAllowInsecureTls(!checked);
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