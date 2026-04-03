"use client";

import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { ThemeNoticeDialog } from "@/components/ThemeNoticeDialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AuthService, AuthSession, useLocalStorage } from "@/lib";

import {
  ParticlesBackground,
  ParticlesBackgroundLight,
  StarsBackground,
  StarsBackgroundLight,
} from "./components/Background";
import { DashboardFilterBarSkeleton } from "./components/DashboardFilterBar";
import {
  DashboardFeedViewport,
  DashboardScaffold,
} from "./components/DashboardScaffold";
import { DashboardSidebarSkeleton } from "./components/DashboardSidebarContent";
import { FeedListSkeleton } from "./components/feed/FeedListSkeleton";
import { LoginView } from "./components/login/LoginView";
import { BackgroundMode, DASHBOARD_EVENTS, DASHBOARD_PREVIEW_STORAGE_KEY } from "./constants";
import { DashboardView } from "./DashboardView";
import { setDashboardPreviewPersistence } from "./preview-mode";
import { DashboardQueryProvider } from "./providers/DashboardQueryProvider";

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
  const [currentUser, setCurrentUser] = useState(
    initialSession?.authenticated === true ? initialSession.user : null,
  );
  const [allowSignup, setAllowSignup] = useState(
    initialSession?.allowSignup ?? true,
  );
  const [usePlaceholderData, setUsePlaceholderData] = useState(
    initialSession?.usePlaceholderData ?? false,
  );
  const [isPreviewMode, setIsPreviewMode] = useLocalStorage(
    DASHBOARD_PREVIEW_STORAGE_KEY,
    initialPreviewMode,
  );
  const { resolvedTheme } = useTheme();
  const [backgroundMode, setBackgroundMode] = useLocalStorage<BackgroundMode>(
    "librerss:backgroundMode",
    "particles",
  );
  const [distillStrategy, setDistillStrategy] = useLocalStorage(
    "librerss:distillStrategy",
    "librerss",
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
    : "librerss";

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

  const viewKey = isSessionLoading
    ? "skeleton"
    : !currentUser && !resolvedPreviewMode
      ? "login"
      : "dashboard";

  return (
    <AnimatePresence mode="wait">
      {isSessionLoading ? (
        <motion.main
          animate={{ opacity: 1, scale: 1 }}
          aria-busy="true"
          aria-label="Loading dashboard"
          className="h-full overflow-hidden bg-background"
          exit={{ opacity: 0, scale: 0.995 }}
          initial={{ opacity: 1, scale: 1 }}
          key={viewKey}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="relative h-full overflow-hidden">
            <div
              aria-hidden="true"
              className="
                pointer-events-none absolute top-1/2 size-64 -translate-y-1/2
                rounded-full bg-primary/5 blur-3xl
              "
            />
            <DashboardScaffold
              feed={
                <DashboardFeedViewport>
                  <FeedListSkeleton />
                </DashboardFeedViewport>
              }
              filterBar={<DashboardFilterBarSkeleton />}
              sidebar={
                <ScrollArea className="h-full">
                  <DashboardSidebarSkeleton />
                </ScrollArea>
              }
            />
          </div>
        </motion.main>
      ) : !currentUser && !resolvedPreviewMode ? (
        <motion.main
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="h-full overflow-hidden bg-background"
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          key={viewKey}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <LoginView
            allowSignup={allowSignup}
            onAuthenticated={setCurrentUser}
            onEnterPreview={!allowSignup ? handleEnterPreview : undefined}
          />
        </motion.main>
      ) : (
        <motion.main
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="relative h-full overflow-hidden bg-background"
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          key={viewKey}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
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
        </motion.main>
      )}
    </AnimatePresence>
  );
}
