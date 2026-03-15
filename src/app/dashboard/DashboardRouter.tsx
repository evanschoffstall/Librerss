"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import {
  ParticlesBackground,
  ParticlesBackgroundLight,
  StarsBackground,
  StarsBackgroundLight,
} from "./components/Background";
import { DashboardShellSkeleton } from "./components/DashboardShellSkeleton";
import { LoginView } from "./components/login/LoginView";
import { DashboardQueryProvider } from "./providers/DashboardQueryProvider";
import type { BackgroundMode } from "./constants";
import { DASHBOARD_EVENTS, DASHBOARD_PREVIEW_STORAGE_KEY } from "./constants";
import { DashboardView } from "./DashboardView";
import { setDashboardPreviewPersistence } from "./preview-mode";

import { ThemeNoticeDialog } from "@/components/ThemeNoticeDialog";
import { AuthService } from "@/lib/api/auth-service";
import type { AuthSession, AuthUser } from "@/lib/core/types";
import { useLocalStorage } from "@/lib/hooks/useLocalStorage";

interface DashboardRouterProps {
  hasPreviewQuery: boolean;
  initialPreviewMode: boolean;
  initialSession?: AuthSession;
}

export function DashboardRouter({
  hasPreviewQuery,
  initialPreviewMode,
  initialSession,
}: DashboardRouterProps) {
  const [hasHydratedClientState, setHasHydratedClientState] = useState(false);
  const [isSessionLoading, setIsSessionLoading] = useState(
    initialSession === undefined && !initialPreviewMode,
  );
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(
    initialSession?.authenticated === true ? initialSession.user : null,
  );
  const [allowSignup, setAllowSignup] = useState(
    initialSession?.allowSignup ?? true,
  );
  const [usePlaceholderData, setUsePlaceholderData] = useState(
    initialSession?.usePlaceholderData ?? false,
  );
  const [isPreviewMode, setIsPreviewMode] = useLocalStorage<boolean>(
    DASHBOARD_PREVIEW_STORAGE_KEY,
    false,
  );
  const { resolvedTheme } = useTheme();
  const [backgroundMode, setBackgroundMode] = useLocalStorage<BackgroundMode>(
    "librerss:backgroundMode",
    "particles",
  );
  const [distillStrategy, setDistillStrategy] = useLocalStorage<string>(
    "librerss:distillStrategy",
    "custom",
  );

  const isLightMode = (resolvedTheme ?? "dark") === "light";
  const resolvedPreviewMode = hasHydratedClientState
    ? isPreviewMode
    : initialPreviewMode;
  const resolvedBackgroundMode = hasHydratedClientState
    ? backgroundMode
    : "particles";
  const resolvedDistillStrategy = hasHydratedClientState
    ? distillStrategy
    : "custom";

  useEffect(() => {
    setHasHydratedClientState(true);
  }, []);

  useEffect(() => {
    if (!initialPreviewMode) {
      return;
    }

    setIsPreviewMode(true);
    setDashboardPreviewPersistence(true);
    window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.ENTER_PREVIEW));
  }, [initialPreviewMode, setIsPreviewMode]);

  useEffect(() => {
    if (!hasHydratedClientState) {
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
        if (
          session.authenticated ||
          (session.allowSignup && !hasPreviewQuery)
        ) {
          setIsPreviewMode(false);
          setDashboardPreviewPersistence(false);
        }
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
    setIsPreviewMode,
  ]);

  const handleEnterPreview = () => {
    setIsPreviewMode(true);
    setDashboardPreviewPersistence(true);
    window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.ENTER_PREVIEW));
    window.location.assign("/dashboard?explore=1");
  };

  if (isSessionLoading) {
    return <DashboardShellSkeleton />;
  }

  if (!currentUser && !resolvedPreviewMode) {
    return (
      <main className="h-full overflow-hidden bg-background">
        <LoginView
          allowSignup={allowSignup}
          onAuthenticated={setCurrentUser}
          onEnterPreview={!allowSignup ? handleEnterPreview : undefined}
        />
      </main>
    );
  }

  return (
    <main className="relative h-full overflow-hidden bg-background">
      <ThemeNoticeDialog />
      {resolvedBackgroundMode === "particles" ? (
        isLightMode ? (
          <ParticlesBackgroundLight />
        ) : (
          <ParticlesBackground />
        )
      ) : resolvedBackgroundMode === "stars" ? (
        isLightMode ? (
          <StarsBackgroundLight />
        ) : (
          <StarsBackground />
        )
      ) : null}
      <div className="relative z-10 h-full">
        <DashboardQueryProvider>
          <DashboardView
            backgroundMode={resolvedBackgroundMode}
            distillStrategy={resolvedDistillStrategy}
            onBackgroundModeChange={setBackgroundMode}
            onDistillStrategyChange={setDistillStrategy}
            usePlaceholderData={resolvedPreviewMode || usePlaceholderData}
          />
        </DashboardQueryProvider>
      </div>
    </main>
  );
}
