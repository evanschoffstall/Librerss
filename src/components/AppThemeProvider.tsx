"use client";

import { Moon, Sun } from "lucide-react";
import { ThemeProvider, useTheme } from "next-themes";
import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode, Suspense, useEffect, useState } from "react";
import { Toaster } from "sonner";

import { DashboardToolbar } from "@/app/dashboard/components/DashboardToolbar";
import { Skeleton } from "@/components/ui/skeleton";

const toastViewportOffset = {
  bottom: 16,
  left: 16,
  right: 16,
};

const mobileToastViewportOffset = {
  bottom: 16,
  left: 16,
  right: 16,
};

/**
 * Provides the app-wide theme context along with shared floating UI such as
 * the theme toggle and the global toast mount.
 */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      disableTransitionOnChange
      enableSystem
    >
      {children}
      <NextDevToolsThemeBridge />
      <Suspense fallback={null}>
        <ThemeModeToggle />
      </Suspense>
      <Suspense fallback={null}>
        <ThemedToaster />
      </Suspense>
    </ThemeProvider>
  );
}

/**
 * Mirrors the resolved app theme onto the Next.js dev-tools portal host so the
 * shadow-DOM error overlay follows the active light or dark mode in development.
 */
function NextDevToolsThemeBridge() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    const activeTheme = resolvedTheme === "light" ? "light" : "dark";

    const syncPortalTheme = () => {
      for (const portal of document.querySelectorAll<HTMLElement>(
        "nextjs-portal",
      )) {
        portal.classList.remove("dark", "light");
        portal.classList.add(activeTheme);
        portal.style.colorScheme = activeTheme;
      }
    };

    syncPortalTheme();

    const observer = new MutationObserver(() => {
      syncPortalTheme();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [resolvedTheme]);

  return null;
}

/**
 * Mounts the global Sonner toaster with the active light or dark theme.
 */
function ThemedToaster() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const handleToastClickToDismiss = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (
        target.closest(
          "button, a, input, textarea, select, label, [role='button'], [data-button], [data-close-button]",
        )
      ) {
        return;
      }

      const toastElement = target.closest<HTMLElement>(
        "[data-sonner-toast][data-dismissible='true']",
      );
      if (!toastElement) {
        return;
      }

      const closeButton = toastElement.querySelector<HTMLButtonElement>(
        "[data-close-button]",
      );
      closeButton?.click();
    };

    document.addEventListener("click", handleToastClickToDismiss);
    return () => {
      document.removeEventListener("click", handleToastClickToDismiss);
    };
  }, []);

  return (
    <Toaster
      closeButton
      duration={3000}
      mobileOffset={mobileToastViewportOffset}
      offset={toastViewportOffset}
      position="bottom-right"
      richColors
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      toastOptions={{
        classNames: {
          closeButton: "!bg-background !border-border/50",
          description: "!text-muted-foreground",
          toast:
            "!rounded-xl !border-border/50 !bg-background/95 !shadow-lg !backdrop-blur-sm",
        },
        style: {
          justifyContent: "flex-start",
          textAlign: "left",
        },
      }}
    />
  );
}

/**
 * Renders either the full dashboard toolbar or a standalone theme toggle,
 * depending on the current route.
 */
function ThemeModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = (resolvedTheme ?? "dark") === "dark";
  const isDashboardRoute = pathname === "/dashboard";
  const dashboardView = searchParams.get("view") ?? "dashboard";
  const nextTheme = isDark ? "light" : "dark";

  if (isDashboardRoute && dashboardView === "dashboard") {
    return <DashboardToolbar />;
  }

  return (
    <div className="fixed top-4 right-6 z-50">
      {mounted ? (
        <button
          aria-label={`Switch to ${nextTheme} mode`}
          className="
            text-muted-foreground transition-colors duration-200
            hover:text-foreground
            focus-visible:ring-2 focus-visible:ring-ring
            focus-visible:outline-none
          "
          onClick={() => {
            setTheme(nextTheme);
          }}
          type="button"
        >
          {isDark ? (
            <Sun className="size-4" />
          ) : (
            <Moon className="size-4" />
          )}
        </button>
      ) : (
        <Skeleton className="size-4 rounded-full" />
      )}
    </div>
  );
}
