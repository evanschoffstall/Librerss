"use client";

import type React from "react";

import { AnimatePresence } from "motion/react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";

import {
  type BackgroundMode,
  DASHBOARD_EVENTS,
} from "@/app/dashboard/dashboard-services/dashboard-constants";
import { setDashboardPreviewPersistence } from "@/app/dashboard/preview-mode";
import { AuthService } from "@/lib/api";
import { type AuthSession } from "@/lib/core";
import { useLocalStorage } from "@/lib/hooks";

import {
  DashboardApplicationSurface,
  DashboardLoginSurface,
  DashboardSkeletonView,
} from "./surfaces";

interface DashboardRouterProps {
  hasPreviewQuery: boolean;
  initialAutoLoginPath?: string;
  initialLoginErrorMessage?: string;
  initialPreviewMode: boolean;
  initialSession?: AuthSession;
}

/** Routes between dashboard loading, login, and the hydrated app surface. */
export function DashboardRouter(props: DashboardRouterProps) {
  const routerState = useDashboardRouterState(props);
  const viewKey = resolveDashboardRouterViewKey(
    routerState.isSessionLoading,
    routerState.currentUser,
    routerState.resolvedPreviewMode,
  );

  return (
    <AnimatePresence mode="wait">
      {routerState.isSessionLoading ? (
        <DashboardSkeletonView viewKey={viewKey} />
      ) : !routerState.currentUser && !routerState.resolvedPreviewMode ? (
        <DashboardLoginSurface
          allowSignup={routerState.allowSignup}
          initialAutoLoginPath={props.initialAutoLoginPath}
          initialFormError={props.initialLoginErrorMessage}
          onAuthenticated={routerState.setCurrentUser}
          onEnterPreview={
            routerState.allowSignup ? undefined : routerState.handleEnterPreview
          }
          shouldAutoLogin={routerState.shouldAutoLogin}
          viewKey={viewKey}
        />
      ) : (
        <DashboardApplicationSurface
          backgroundMode={routerState.resolvedBackgroundMode}
          distillStrategy={routerState.resolvedDistillStrategy}
          isLightMode={routerState.isLightMode}
          onBackgroundModeChange={routerState.setBackgroundMode}
          onDistillStrategyChange={routerState.setDistillStrategy}
          usePlaceholderData={
            routerState.resolvedPreviewMode || routerState.usePlaceholderData
          }
          viewKey={viewKey}
        />
      )}
    </AnimatePresence>
  );
}

function buildDashboardRouterState({
  handleEnterPreview,
  routerDerivedState,
  routerPreferenceState,
  routerSessionState,
}: {
  handleEnterPreview: () => void;
  routerDerivedState: ReturnType<typeof resolveDashboardRouterDerivedState>;
  routerPreferenceState: ReturnType<typeof useDashboardRouterPreferenceState>;
  routerSessionState: ReturnType<typeof useDashboardRouterSessionState>;
}) {
  return {
    allowSignup: routerSessionState.allowSignup,
    currentUser: routerSessionState.currentUser,
    handleEnterPreview,
    isLightMode: routerDerivedState.isLightMode,
    isSessionLoading: routerSessionState.isSessionLoading,
    resolvedBackgroundMode: routerDerivedState.resolvedBackgroundMode,
    resolvedDistillStrategy: routerDerivedState.resolvedDistillStrategy,
    resolvedPreviewMode: routerDerivedState.resolvedPreviewMode,
    setBackgroundMode: routerPreferenceState.setBackgroundMode,
    setCurrentUser: routerSessionState.setCurrentUser,
    setDistillStrategy: routerPreferenceState.setDistillStrategy,
    shouldAutoLogin: routerDerivedState.shouldAutoLogin,
    usePlaceholderData: routerSessionState.usePlaceholderData,
  };
}

function resolveDashboardRouterDerivedState({
  backgroundMode,
  currentUser,
  distillStrategy,
  hasHydratedClientState,
  initialAutoLoginPath,
  initialPreviewMode,
  isPreviewMode,
  resolvedTheme,
}: {
  backgroundMode: BackgroundMode;
  currentUser: AuthSession["user"] | null;
  distillStrategy: string;
  hasHydratedClientState: boolean;
  initialAutoLoginPath?: string;
  initialPreviewMode: boolean;
  isPreviewMode: boolean;
  resolvedTheme?: string;
}) {
  const resolvedPreviewMode = hasHydratedClientState
    ? isPreviewMode
    : initialPreviewMode;

  return {
    isLightMode: (resolvedTheme ?? "dark") === "light",
    resolvedBackgroundMode: hasHydratedClientState
      ? backgroundMode
      : "particles",
    resolvedDistillStrategy: hasHydratedClientState
      ? distillStrategy
      : "librerss",
    resolvedPreviewMode,
    shouldAutoLogin:
      Boolean(initialAutoLoginPath) && !currentUser && !resolvedPreviewMode,
  };
}

function resolveDashboardRouterViewKey(
  isSessionLoading: boolean,
  currentUser: AuthSession["user"] | null,
  resolvedPreviewMode: boolean,
) {
  if (isSessionLoading) {
    return "skeleton";
  }

  return !currentUser && !resolvedPreviewMode ? "login" : "dashboard";
}

function useDashboardEnterPreview(
  setIsPreviewMode: React.Dispatch<React.SetStateAction<boolean>>,
) {
  return useCallback(() => {
    setIsPreviewMode(true);
    window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.ENTER_PREVIEW));
    window.location.assign("/dashboard?explore=1");
  }, [setIsPreviewMode]);
}

function useDashboardRouterEffects({
  hasHydratedClientState,
  hasPreviewQuery,
  initialPreviewMode,
  resolvedPreviewMode,
  setAllowSignup,
  setCurrentUser,
  setHasHydratedClientState,
  setIsPreviewMode,
  setIsSessionLoading,
  setUsePlaceholderData,
  shouldAutoLogin,
}: {
  hasHydratedClientState: boolean;
  hasPreviewQuery: boolean;
  initialPreviewMode: boolean;
  resolvedPreviewMode: boolean;
  setAllowSignup: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentUser: React.Dispatch<
    React.SetStateAction<AuthSession["user"] | null>
  >;
  setHasHydratedClientState: React.Dispatch<React.SetStateAction<boolean>>;
  setIsPreviewMode: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSessionLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setUsePlaceholderData: React.Dispatch<React.SetStateAction<boolean>>;
  shouldAutoLogin: boolean;
}) {
  useDashboardRouterHydrationEffects({
    hasHydratedClientState,
    hasPreviewQuery,
    initialPreviewMode,
    resolvedPreviewMode,
    setHasHydratedClientState,
    setIsPreviewMode,
  });
  useDashboardRouterSessionEffect({
    hasHydratedClientState,
    hasPreviewQuery,
    resolvedPreviewMode,
    setAllowSignup,
    setCurrentUser,
    setIsSessionLoading,
    setUsePlaceholderData,
    shouldAutoLogin,
  });
}

function useDashboardRouterHydrationEffects({
  hasHydratedClientState,
  hasPreviewQuery,
  initialPreviewMode,
  resolvedPreviewMode,
  setHasHydratedClientState,
  setIsPreviewMode,
}: {
  hasHydratedClientState: boolean;
  hasPreviewQuery: boolean;
  initialPreviewMode: boolean;
  resolvedPreviewMode: boolean;
  setHasHydratedClientState: React.Dispatch<React.SetStateAction<boolean>>;
  setIsPreviewMode: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  useEffect(() => {
    setHasHydratedClientState(true);
  }, [setHasHydratedClientState]);

  useEffect(() => {
    if (!initialPreviewMode) {
      return;
    }

    setIsPreviewMode(true);
    window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.ENTER_PREVIEW));
  }, [initialPreviewMode, setIsPreviewMode]);

  useEffect(() => {
    if (!hasHydratedClientState || hasPreviewQuery || resolvedPreviewMode) {
      return;
    }

    setIsPreviewMode(false);
    setDashboardPreviewPersistence(false);
  }, [
    hasHydratedClientState,
    hasPreviewQuery,
    resolvedPreviewMode,
    setIsPreviewMode,
  ]);
}

function useDashboardRouterPreferenceState(initialPreviewMode: boolean) {
  const [hasHydratedClientState, setHasHydratedClientState] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(initialPreviewMode);
  const { resolvedTheme } = useTheme();
  const [backgroundMode, setBackgroundMode] = useLocalStorage<BackgroundMode>(
    "librerss:backgroundMode",
    "particles",
  );
  const [distillStrategy, setDistillStrategy] = useLocalStorage(
    "librerss:distillStrategy",
    "librerss",
  );

  return {
    backgroundMode,
    distillStrategy,
    hasHydratedClientState,
    isPreviewMode,
    resolvedTheme,
    setBackgroundMode,
    setDistillStrategy,
    setHasHydratedClientState,
    setIsPreviewMode,
  };
}

function useDashboardRouterSessionEffect({
  hasHydratedClientState,
  hasPreviewQuery,
  resolvedPreviewMode,
  setAllowSignup,
  setCurrentUser,
  setIsSessionLoading,
  setUsePlaceholderData,
  shouldAutoLogin,
}: {
  hasHydratedClientState: boolean;
  hasPreviewQuery: boolean;
  resolvedPreviewMode: boolean;
  setAllowSignup: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentUser: React.Dispatch<
    React.SetStateAction<AuthSession["user"] | null>
  >;
  setIsSessionLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setUsePlaceholderData: React.Dispatch<React.SetStateAction<boolean>>;
  shouldAutoLogin: boolean;
}) {
  useEffect(() => {
    if (!hasHydratedClientState) {
      return;
    }

    if (shouldAutoLogin) {
      setIsSessionLoading(false);
      return;
    }

    if (resolvedPreviewMode) {
      setCurrentUser(null);
      setIsSessionLoading(false);
      return;
    }

    let isCanceled = false;

    const loadSession = async () => {
      try {
        const session = await AuthService.getSession();
        if (isCanceled) {
          return;
        }

        setAllowSignup(session.allowSignup);
        setUsePlaceholderData(session.usePlaceholderData);
        setCurrentUser(session.authenticated ? session.user : null);
      } catch {
        if (isCanceled) {
          return;
        }

        setAllowSignup(true);
        setCurrentUser(null);
      } finally {
        if (!isCanceled) {
          setIsSessionLoading(false);
        }
      }
    };

    void loadSession();

    return () => {
      isCanceled = true;
    };
  }, [
    hasHydratedClientState,
    hasPreviewQuery,
    resolvedPreviewMode,
    setAllowSignup,
    setCurrentUser,
    setIsSessionLoading,
    setUsePlaceholderData,
    shouldAutoLogin,
  ]);
}

function useDashboardRouterSessionState(
  initialSession: AuthSession | undefined,
  initialPreviewMode: boolean,
) {
  const [isSessionLoading, setIsSessionLoading] = useState(
    initialSession === undefined && !initialPreviewMode,
  );
  const [currentUser, setCurrentUser] = useState(
    initialSession?.authenticated === true ? initialSession.user : null,
  );
  const [allowSignup, setAllowSignup] = useState(
    initialSession?.allowSignup ?? true,
  );
  const [usePlaceholderData, setUsePlaceholderData] = useState(
    initialSession?.usePlaceholderData ?? false,
  );

  return {
    allowSignup,
    currentUser,
    isSessionLoading,
    setAllowSignup,
    setCurrentUser,
    setIsSessionLoading,
    setUsePlaceholderData,
    usePlaceholderData,
  };
}

function useDashboardRouterState({
  hasPreviewQuery,
  initialAutoLoginPath,
  initialPreviewMode,
  initialSession,
}: Pick<
  DashboardRouterProps,
  | "hasPreviewQuery"
  | "initialAutoLoginPath"
  | "initialPreviewMode"
  | "initialSession"
>) {
  const routerSessionState = useDashboardRouterSessionState(
    initialSession,
    initialPreviewMode,
  );
  const routerPreferenceState =
    useDashboardRouterPreferenceState(initialPreviewMode);
  const routerDerivedState = resolveDashboardRouterDerivedState({
    backgroundMode: routerPreferenceState.backgroundMode,
    currentUser: routerSessionState.currentUser,
    distillStrategy: routerPreferenceState.distillStrategy,
    hasHydratedClientState: routerPreferenceState.hasHydratedClientState,
    initialAutoLoginPath,
    initialPreviewMode,
    isPreviewMode: routerPreferenceState.isPreviewMode,
    resolvedTheme: routerPreferenceState.resolvedTheme,
  });
  const handleEnterPreview = useDashboardEnterPreview(
    routerPreferenceState.setIsPreviewMode,
  );

  useDashboardRouterEffects({
    hasHydratedClientState: routerPreferenceState.hasHydratedClientState,
    hasPreviewQuery,
    initialPreviewMode,
    resolvedPreviewMode: routerDerivedState.resolvedPreviewMode,
    setAllowSignup: routerSessionState.setAllowSignup,
    setCurrentUser: routerSessionState.setCurrentUser,
    setHasHydratedClientState: routerPreferenceState.setHasHydratedClientState,
    setIsPreviewMode: routerPreferenceState.setIsPreviewMode,
    setIsSessionLoading: routerSessionState.setIsSessionLoading,
    setUsePlaceholderData: routerSessionState.setUsePlaceholderData,
    shouldAutoLogin: routerDerivedState.shouldAutoLogin,
  });

  return buildDashboardRouterState({
    handleEnterPreview,
    routerDerivedState,
    routerPreferenceState,
    routerSessionState,
  });
}
