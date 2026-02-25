"use client";

import { AuthService, type AuthUser, useLocalStorage } from "@/lib";
import { Loader2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { LoginView } from "./components/login/LoginView";
import { ParticlesBackground } from "./components/ParticlesBackground";
import { DASHBOARD_EVENTS } from "./constants";
import { DashboardView } from "./DashboardView";

export function DashboardRouter() {
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [allowSignup, setAllowSignup] = useState(true);
  const [usePlaceholderData, setUsePlaceholderData] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const { resolvedTheme } = useTheme();
  const [showParticlesBackground, setShowParticlesBackground] = useLocalStorage<boolean>(
    "librerss:showParticlesBackground",
    true,
  );

  const shouldShowParticlesBackground =
    showParticlesBackground && (resolvedTheme ?? "dark") === "dark";

  useEffect(() => {
    const loadSession = async () => {
      try {
        const session = await AuthService.getSession();
        setAllowSignup(session.allowSignup);
        setUsePlaceholderData(session.usePlaceholderData);
        setCurrentUser(session.authenticated ? session.user : null);
      } catch {
        setAllowSignup(true);
        setCurrentUser(null);
      } finally {
        setIsSessionLoading(false);
      }
    };

    void loadSession();
  }, []);

  const handleEnterPreview = () => {
    setIsPreviewMode(true);
    window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.ENTER_PREVIEW));
  };

  if (isSessionLoading) {
    return (
      <main className="h-full overflow-hidden bg-background">
        <div className="flex h-full items-center justify-center">
          <Loader2 className="size-4 animate-spin text-muted-foreground/40" />
        </div>
      </main>
    );
  }

  if (!currentUser && !isPreviewMode) {
    return (
      <main className="h-full overflow-hidden bg-background">
        <LoginView
          onAuthenticated={setCurrentUser}
          allowSignup={allowSignup}
          onEnterPreview={!allowSignup ? handleEnterPreview : undefined}
        />
      </main>
    );
  }

  return (
    <main className="relative h-full overflow-hidden bg-background">
      {shouldShowParticlesBackground ? <ParticlesBackground /> : null}
      <div className="relative z-10 h-full">
        <DashboardView
          usePlaceholderData={isPreviewMode || usePlaceholderData}
          showParticlesBackground={showParticlesBackground}
          onShowParticlesBackgroundChange={setShowParticlesBackground}
        />
      </div>
    </main>
  );
}
