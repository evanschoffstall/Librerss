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

interface DashboardApplicationSurfaceProps {
  backgroundMode: BackgroundMode;
  distillStrategy: string;
  isLightMode: boolean;
  onBackgroundModeChange: (value: BackgroundMode) => void;
  onDistillStrategyChange: (value: string) => void;
  usePlaceholderData: boolean;
  viewKey: string;
}

interface DashboardBackgroundProps {
  backgroundMode: BackgroundMode;
  isLightMode: boolean;
}
interface DashboardLoginSurfaceProps {
  allowSignup: boolean;
  initialAutoLoginPath?: string;
  initialFormError?: string;
  onAuthenticated: React.Dispatch<
    React.SetStateAction<AuthSession["user"] | null>
  >;
  onEnterPreview?: () => void;
  shouldAutoLogin: boolean;
  viewKey: string;
}

interface DashboardSkeletonViewProps {
  viewKey: string;
}
/**
 * Render the dashboard application surface component.
 * @param props - The component props.
 * @returns The rendered dashboard application surface component.
 */
export function DashboardApplicationSurface(
  props: DashboardApplicationSurfaceProps,
) {
  const {
    backgroundMode,
    distillStrategy,
    isLightMode,
    onBackgroundModeChange,
    onDistillStrategyChange,
    usePlaceholderData,
    viewKey,
  } = props;
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
 * Render the dashboard login surface component.
 * @param props - The component props.
 * @returns The rendered dashboard login surface component.
 */
export function DashboardLoginSurface(props: DashboardLoginSurfaceProps) {
  const {
    allowSignup,
    initialAutoLoginPath,
    initialFormError,
    onAuthenticated,
    onEnterPreview,
    shouldAutoLogin,
    viewKey,
  } = props;
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
 * Render the dashboard skeleton view component.
 * @param props - The component props.
 * @returns The rendered dashboard skeleton view component.
 */
export function DashboardSkeletonView(props: DashboardSkeletonViewProps) {
  const { viewKey } = props;
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
 * Render the dashboard background component.
 * @param props - The component props.
 * @returns The rendered dashboard background component.
 */
function DashboardBackground(props: DashboardBackgroundProps) {
  const { backgroundMode, isLightMode } = props;
  if (backgroundMode === "particles") {
    return isLightMode ? <ParticlesBackgroundLight /> : <ParticlesBackground />;
  }

  if (backgroundMode === "stars") {
    return isLightMode ? <StarsBackgroundLight /> : <StarsBackground />;
  }

  return null;
}
