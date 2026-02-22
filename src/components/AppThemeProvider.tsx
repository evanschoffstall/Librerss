"use client";

import { Input } from "@/components/ui/input";
import { AuthService } from "@/lib";
import { LogOut, Moon, RefreshCw, Search, Settings2, Sun } from "lucide-react";
import { ThemeProvider, useTheme } from "next-themes";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { Toaster, toast } from "sonner";

function ThemeModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [dashboardTitle, setDashboardTitle] = useState("LibreRSS");
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = (resolvedTheme ?? "dark") === "dark";
  const isDashboardRoute = pathname === "/dashboard";
  const dashboardView = searchParams?.get("view") || "dashboard";
  const shouldShowDashboardBar = isDashboardRoute && dashboardView === "dashboard";
  const nextTheme = isDark ? "light" : "dark";

  useEffect(() => {
    const handleTitleChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ title?: string }>;
      const nextTitle = customEvent.detail?.title?.trim();
      setDashboardTitle(nextTitle || "LibreRSS");
    };

    const handleSearchSync = (event: Event) => {
      const customEvent = event as CustomEvent<{ term?: string }>;
      setDashboardSearch(customEvent.detail?.term ?? "");
    };

    const handleEnterPreview = () => setIsPreviewMode(true);

    window.addEventListener("dashboard:title-change", handleTitleChange as EventListener);
    window.addEventListener("dashboard:search-sync", handleSearchSync as EventListener);
    window.addEventListener("dashboard:enter-preview", handleEnterPreview);
    return () => {
      window.removeEventListener("dashboard:title-change", handleTitleChange as EventListener);
      window.removeEventListener("dashboard:search-sync", handleSearchSync as EventListener);
      window.removeEventListener("dashboard:enter-preview", handleEnterPreview);
    };
  }, []);

  const handleDashboardRefresh = () => {
    window.dispatchEvent(new CustomEvent("dashboard:refresh"));
  };

  const handleDashboardSettings = () => {
    window.dispatchEvent(new CustomEvent("dashboard:open-settings"));
  };

  const handleDashboardSearchChange = (term: string) => {
    setDashboardSearch(term);
    window.dispatchEvent(new CustomEvent("dashboard:search-change", { detail: { term } }));
  };

  const handleDashboardSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    if (isPreviewMode) {
      window.location.assign("/dashboard");
      return;
    }

    setIsSigningOut(true);
    try {
      await AuthService.logout();
      window.location.assign("/landing");
    } catch {
      toast.error("Unable to sign out.");
      setIsSigningOut(false);
    }
  };

  if (shouldShowDashboardBar) {
    return (
      <div className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 md:px-6">
          <h1 className="text-lg font-semibold tracking-tight">{dashboardTitle}</h1>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/40" />
            <Input
              value={dashboardSearch}
              onChange={(e) => handleDashboardSearchChange(e.target.value)}
              placeholder="Search..."
              className="h-9 border-transparent bg-muted/30 pl-9 text-sm focus-visible:bg-background"
            />
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleDashboardRefresh}
              aria-label="Refresh selected feed"
              className="transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-zinc-600 hover:text-zinc-300"
            >
              <RefreshCw className="h-4 w-4" />
              <span className="sr-only">Refresh selected feed</span>
            </button>

            <button
              type="button"
              onClick={handleDashboardSettings}
              aria-label="Open dashboard settings"
              className="transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-zinc-600 hover:text-zinc-300"
            >
              <Settings2 className="h-4 w-4" />
              <span className="sr-only">Open settings</span>
            </button>

            <button
              type="button"
              onClick={() => void handleDashboardSignOut()}
              aria-label="Sign out"
              disabled={isSigningOut}
              className="transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-zinc-600 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" />
              <span className="sr-only">Sign out</span>
            </button>

            <span className="h-3 w-px bg-zinc-800" />

            <button
              type="button"
              onClick={() => setTheme(nextTheme)}
              aria-label={`Switch to ${nextTheme} mode`}
              className="transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-zinc-600 hover:text-zinc-300"
            >
              {mounted && isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="sr-only">Switch to {nextTheme} mode</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed right-6 top-4 z-50">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setTheme(nextTheme)}
          aria-label={`Switch to ${nextTheme} mode`}
          className="transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-zinc-600 hover:text-zinc-300"
        >
          {mounted && isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          <span className="sr-only">Switch to {nextTheme} mode</span>
        </button>
      </div>
    </div>
  );
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dashboardView = searchParams?.get("view") || "dashboard";
  const shouldOffsetForDashboardBar = pathname === "/dashboard" && dashboardView === "dashboard";

  return (
    <Toaster
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="top-right"
      offset={
        shouldOffsetForDashboardBar
          ? { top: "4.25rem", right: "1rem" }
          : { top: "1rem", right: "1rem" }
      }
      richColors
      closeButton
      duration={4000}
    />
  );
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
      <Suspense fallback={null}>
        <ThemeModeToggle />
      </Suspense>
      <Suspense fallback={null}>
        <ThemedToaster />
      </Suspense>
    </ThemeProvider>
  );
}
