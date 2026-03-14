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
import type { BackgroundMode } from "./constants";
import { DASHBOARD_EVENTS, DASHBOARD_PREVIEW_STORAGE_KEY } from "./constants";
import { DashboardView } from "./DashboardView";

import { ThemeNoticeDialog } from "@/components/ThemeNoticeDialog";
import { AuthService, type AuthUser, useLocalStorage } from "@/lib";
import type { AuthSession } from "@/lib/core/types";

interface DashboardRouterProps {
  hasPreviewQuery: boolean;
  initialSession?: AuthSession;
}

export function DashboardRouter({
  hasPreviewQuery,
  initialSession,
}: DashboardRouterProps) {
  const [isSessionLoading, setIsSessionLoading] = useState(
    initialSession === undefined,
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

  useEffect(() => {
    if (!hasPreviewQuery) {
      return;
    }

    setIsPreviewMode(true);
    window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.ENTER_PREVIEW));
  }, [hasPreviewQuery, setIsPreviewMode]);

  useEffect(() => {
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
  }, [hasPreviewQuery, setIsPreviewMode]);

  const handleEnterPreview = () => {
    setIsPreviewMode(true);
    window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.ENTER_PREVIEW));
  };

  if (isSessionLoading) {
    return <DashboardShellSkeleton />;
  }

  if (!currentUser && !isPreviewMode) {
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
      {backgroundMode === "particles" ? (
        isLightMode ? (
          <ParticlesBackgroundLight />
        ) : (
          <ParticlesBackground />
        )
      ) : backgroundMode === "stars" ? (
        isLightMode ? (
          <StarsBackgroundLight />
        ) : (
          <StarsBackground />
        )
      ) : null}
      <div className="relative z-10 h-full">
        <DashboardView
          backgroundMode={backgroundMode}
          distillStrategy={distillStrategy}
          onBackgroundModeChange={setBackgroundMode}
          onDistillStrategyChange={setDistillStrategy}
          usePlaceholderData={isPreviewMode || usePlaceholderData}
        />
      </div>
    </main>
  );
}
