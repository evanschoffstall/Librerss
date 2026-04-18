"use client";

import { motion } from "motion/react";

import {
  DashboardToolbarSkeleton,
  ParticlesBackground,
  ParticlesBackgroundLight,
  StarsBackground,
  StarsBackgroundLight,
} from "@/app/dashboard/dashboard-components";
import { FeedListSkeleton } from "@/app/dashboard/dashboard-components/feed-view";
import {
  DashboardFeedViewport,
  DashboardFilterBarSkeleton,
  DashboardScaffold,
  DashboardSidebarSkeleton,
} from "@/app/dashboard/dashboard-components/layout";
import {
  DevAutoLoginRedirect,
  LoginView,
} from "@/app/dashboard/dashboard-components/login";
import {
  type BackgroundMode,
  MOBILE_UI_GROUPED_LAYOUT_STORAGE_KEY,
} from "@/app/dashboard/dashboard-services/dashboard-constants";
import { DashboardView } from "@/app/dashboard/dashboard-view";
import { DashboardQueryProvider } from "@/app/dashboard/providers";
import { ThemeNoticeDialog } from "@/components";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type AuthSession } from "@/lib/core";
import { useLocalStorage } from "@/lib/hooks";

/**
 * @param root0
 * @param root0.backgroundMode
 * @param root0.distillStrategy
 * @param root0.isLightMode
 * @param root0.onBackgroundModeChange
 * @param root0.onDistillStrategyChange
 * @param root0.usePlaceholderData
 * @param root0.viewKey
 */
export function DashboardApplicationSurface({
  backgroundMode,
  distillStrategy,
  isLightMode,
  onBackgroundModeChange,
  onDistillStrategyChange,
  usePlaceholderData,
  viewKey,
}: {
  backgroundMode: BackgroundMode;
  distillStrategy: string;
  isLightMode: boolean;
  onBackgroundModeChange: (value: BackgroundMode) => void;
  onDistillStrategyChange: (value: string) => void;
  usePlaceholderData: boolean;
  viewKey: string;
}) {
  return (
    <motion.main
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="relative h-full overflow-hidden bg-background"
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      key={viewKey}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <ThemeNoticeDialog />
      <DashboardBackground
        backgroundMode={backgroundMode}
        isLightMode={isLightMode}
      />
      <div className="relative z-10 h-full">
        <DashboardQueryProvider>
          <DashboardView
            backgroundMode={backgroundMode}
            distillStrategy={distillStrategy}
            onBackgroundModeChange={onBackgroundModeChange}
            onDistillStrategyChange={onDistillStrategyChange}
            usePlaceholderData={usePlaceholderData}
          />
        </DashboardQueryProvider>
      </div>
    </motion.main>
  );
}

/**
 * @param root0
 * @param root0.allowSignup
 * @param root0.initialAutoLoginPath
 * @param root0.initialFormError
 * @param root0.onAuthenticated
 * @param root0.onEnterPreview
 * @param root0.shouldAutoLogin
 * @param root0.viewKey
 */
export function DashboardLoginSurface({
  allowSignup,
  initialAutoLoginPath,
  initialFormError,
  onAuthenticated,
  onEnterPreview,
  shouldAutoLogin,
  viewKey,
}: {
  allowSignup: boolean;
  initialAutoLoginPath?: string;
  initialFormError?: string;
  onAuthenticated: React.Dispatch<
    React.SetStateAction<AuthSession["user"] | null>
  >;
  onEnterPreview?: () => void;
  shouldAutoLogin: boolean;
  viewKey: string;
}) {
  return (
    <motion.main
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="h-full overflow-hidden bg-background"
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      key={viewKey}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {shouldAutoLogin && initialAutoLoginPath ? (
        <DevAutoLoginRedirect autoLoginPath={initialAutoLoginPath} />
      ) : (
        <LoginView
          allowSignup={allowSignup}
          initialFormError={initialFormError}
          onAuthenticated={onAuthenticated}
          onEnterPreview={onEnterPreview}
        />
      )}
    </motion.main>
  );
}

/**
 * @param root0
 * @param root0.viewKey
 */
export function DashboardSkeletonView({ viewKey }: { viewKey: string }) {
  const [mobileGroupedLayout] = useLocalStorage(
    MOBILE_UI_GROUPED_LAYOUT_STORAGE_KEY,
    true,
  );

  return (
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
        <DashboardToolbarSkeleton
          isDevelopmentMode={process.env.NODE_ENV === "development"}
          mobileToolbarBottom={mobileGroupedLayout}
          mobileToolbarMirror={mobileGroupedLayout}
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
  );
}

/**
 * @param root0
 * @param root0.backgroundMode
 * @param root0.isLightMode
 */
function DashboardBackground({
  backgroundMode,
  isLightMode,
}: {
  backgroundMode: BackgroundMode;
  isLightMode: boolean;
}) {
  if (backgroundMode === "particles") {
    return isLightMode ? <ParticlesBackgroundLight /> : <ParticlesBackground />;
  }

  if (backgroundMode === "stars") {
    return isLightMode ? <StarsBackgroundLight /> : <StarsBackground />;
  }

  return null;
}
