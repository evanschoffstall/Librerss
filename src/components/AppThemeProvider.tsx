"use client";

import { Moon, Sun } from "lucide-react";
import { ThemeProvider, useTheme } from "next-themes";
import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode, Suspense, useEffect, useMemo, useState } from "react";
import { Toaster } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { MOBILE_UI_GROUPED_LAYOUT_STORAGE_KEY } from "@/lib";
import { useIsMobile, useLocalStorage } from "@/lib/hooks";

const bottomToastOffset = { bottom: 16, left: 16, right: 16 };
const trueTopToastOffset = { left: 16, right: 16, top: 16 };

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
 * Resolves the global toast anchor and offset from the grouped mobile UI
 * setting. When grouped layout is enabled, mobile toasts pin to the top edge.
 */
export function getToastPlacement({
  isMobileGroupedLayout,
  isMobileViewport,
}: {
  isMobileGroupedLayout: boolean;
  isMobileViewport: boolean;
}) {
  if (isMobileGroupedLayout && isMobileViewport) {
    return {
      mobileOffset: trueTopToastOffset,
      offset: trueTopToastOffset,
      position: "top-right" as const,
    };
  }

  return {
    mobileOffset: bottomToastOffset,
    offset: bottomToastOffset,
    position: "bottom-right" as const,
  };
}

/**
 * Mirrors the resolved app theme onto the Next.js dev-tools portal host so the
 * shadow-DOM error overlay follows the active light or dark mode in development.
 */
function NextDevToolsThemeBridge() {
  const { resolvedTheme } = useTheme();
  const pathname = usePathname();
  const isMobileViewport = useIsMobile();
  const [isMobileGroupedLayout] = useLocalStorage(
    MOBILE_UI_GROUPED_LAYOUT_STORAGE_KEY,
    true,
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    const activeTheme = resolvedTheme === "light" ? "light" : "dark";
    const shouldUseTopRightDevToolsBadge =
      pathname === "/dashboard" && isMobileViewport && isMobileGroupedLayout;

    const syncPortalTheme = () => {
      for (const portal of document.querySelectorAll<HTMLElement>(
        "nextjs-portal",
      )) {
        portal.classList.remove("dark", "light");
        portal.classList.add(activeTheme);
        portal.style.colorScheme = activeTheme;

        const devToolsIndicator = portal.shadowRoot?.querySelector<HTMLElement>(
          "#devtools-indicator",
        );
        if (!devToolsIndicator) {
          continue;
        }

        if (shouldUseTopRightDevToolsBadge) {
          devToolsIndicator.style.top = "20px";
          devToolsIndicator.style.right = "20px";
          devToolsIndicator.style.bottom = "auto";
          devToolsIndicator.style.left = "auto";
          continue;
        }

        devToolsIndicator.style.bottom = "20px";
        devToolsIndicator.style.left = "20px";
        devToolsIndicator.style.top = "auto";
        devToolsIndicator.style.right = "auto";
      }
    };

    syncPortalTheme();

    if (typeof MutationObserver === "undefined") {
      return;
    }

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
  }, [isMobileGroupedLayout, isMobileViewport, pathname, resolvedTheme]);

  return null;
}

/**
 * Mounts the global Sonner toaster with the active light or dark theme.
 */
function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  const isMobileViewport = useIsMobile();
  const [isMobileGroupedLayout] = useLocalStorage(
    MOBILE_UI_GROUPED_LAYOUT_STORAGE_KEY,
    true,
  );

  const { mobileOffset, offset, position } = useMemo(() => {
    return getToastPlacement({
      isMobileGroupedLayout,
      isMobileViewport,
    });
  }, [isMobileGroupedLayout, isMobileViewport]);

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
      mobileOffset={mobileOffset}
      offset={offset}
      position={position}
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
    return null;
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
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      ) : (
        <Skeleton className="size-4 rounded-full" />
      )}
    </div>
  );
}
