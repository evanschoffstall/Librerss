"use client";

import { useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import {
  ParticlesBackground,
  ParticlesBackgroundLight,
  StarsBackground,
  StarsBackgroundLight,
} from "./components/Background";
import { LoginView } from "./components/login/LoginView";
import type { BackgroundMode } from "./constants";
import { DASHBOARD_EVENTS, DASHBOARD_PREVIEW_STORAGE_KEY } from "./constants";
import { DashboardView } from "./DashboardView";

import { ThemeNoticeDialog } from "@/components/ThemeNoticeDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthService, type AuthUser, useLocalStorage } from "@/lib";

export function DashboardRouter() {
  const searchParams = useSearchParams();
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [allowSignup, setAllowSignup] = useState(true);
  const [usePlaceholderData, setUsePlaceholderData] = useState(false);
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
  const hasPreviewQuery =
    searchParams.get("preview") === "1" || searchParams.get("explore") === "1";

  useEffect(() => {
    if (!hasPreviewQuery) {
      return;
    }

    setIsPreviewMode(true);
    window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.ENTER_PREVIEW));
  }, [hasPreviewQuery, setIsPreviewMode]);

  useEffect(() => {
    const legacyValue = localStorage.getItem(
      "librerss:showParticlesBackground",
    );
    if (legacyValue === null) {
      return;
    }

    try {
      const parsedValue: unknown = JSON.parse(legacyValue);
      if (typeof parsedValue === "boolean") {
        setBackgroundMode(parsedValue ? "particles" : "none");
      }
    } catch {
      // ignore invalid persisted legacy values
    }

    localStorage.removeItem("librerss:showParticlesBackground");
  }, [setBackgroundMode]);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const session = await AuthService.getSession();
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
        setAllowSignup(true);
        setCurrentUser(null);
      } finally {
        setIsSessionLoading(false);
      }
    };

    void loadSession();
  }, [hasPreviewQuery, setIsPreviewMode]);

  const handleEnterPreview = () => {
    setIsPreviewMode(true);
    window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.ENTER_PREVIEW));
  };

  if (isSessionLoading) {
    return (
      <main className="h-full overflow-hidden bg-background">
        <div className="relative flex h-full items-center justify-center px-4">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute size-64 rounded-full bg-primary/5 blur-3xl"
          />
          <div className="relative w-full max-w-3xl space-y-2">
            <Skeleton className="h-8 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        </div>
      </main>
    );
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
