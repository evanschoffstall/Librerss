"use client";

import { Input } from "@/components/ui/input";
import { AuthService } from "@/lib";
import { CheckCheck, LogOut, Menu, Moon, RefreshCw, Search, Settings2, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const toolbarBtnClass =
  "transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-zinc-600 hover:text-zinc-300";

/**
 * Fixed top bar shown on the dashboard route.
 *
 * Communicates with the dashboard page via custom window events:
 * - Listens: `dashboard:title-change`, `dashboard:search-sync`, `dashboard:enter-preview`
 * - Dispatches: `dashboard:refresh`, `dashboard:open-settings`, `dashboard:search-change`
 */
export function DashboardTopBar() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [title, setTitle] = useState("LibreRSS");
  const [search, setSearch] = useState("");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleTitleChange = (event: Event) => {
      const detail = (event as CustomEvent<{ title?: string }>).detail;
      setTitle(detail?.title?.trim() || "LibreRSS");
    };

    const handleSearchSync = (event: Event) => {
      const detail = (event as CustomEvent<{ term?: string }>).detail;
      setSearch(detail?.term ?? "");
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

  const isDark = (resolvedTheme ?? "dark") === "dark";
  const nextTheme = isDark ? "light" : "dark";

  const handleSearchChange = (term: string) => {
    setSearch(term);
    window.dispatchEvent(new CustomEvent("dashboard:search-change", { detail: { term } }));
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;

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

  return (
    <div className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 md:px-6">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("dashboard:open-feeds-sidebar"))}
          aria-label="Open feeds"
          className={`${toolbarBtnClass} lg:hidden`}
        >
          <Menu className="h-4 w-4" />
        </button>

        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>

        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/40" />
          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search..."
            className="h-9 border-transparent bg-muted/30 pl-9 text-sm focus-visible:bg-background"
          />
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("dashboard:refresh"))}
            aria-label="Refresh selected feed"
            className={toolbarBtnClass}
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("dashboard:mark-all-read"))}
            aria-label="Mark all read"
            className={toolbarBtnClass}
          >
            <CheckCheck className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("dashboard:open-settings"))}
            aria-label="Open dashboard settings"
            className={toolbarBtnClass}
          >
            <Settings2 className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => void handleSignOut()}
            aria-label="Sign out"
            disabled={isSigningOut}
            className={`${toolbarBtnClass} disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <LogOut className="h-4 w-4" />
          </button>

          <span className="h-3 w-px bg-zinc-800" />

          <button
            type="button"
            onClick={() => setTheme(nextTheme)}
            aria-label={`Switch to ${nextTheme} mode`}
            className={toolbarBtnClass}
          >
            {mounted && isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
