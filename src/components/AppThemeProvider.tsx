"use client";

import { Moon, Sun } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { ThemeProvider, useTheme } from "next-themes";
import { type ReactNode, Suspense, useEffect, useState } from "react";
import { Toaster } from "sonner";

import { DashboardTopHeaderBar } from "@/app/dashboard/components/DashboardTopHeaderBar";

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

      const closeButton = toastElement.querySelector<HTMLElement>(
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
      duration={4000}
      position="top-center"
      richColors
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      toastOptions={{
        style: {
          justifyContent: "center",
          textAlign: "center",
        },
      }}
    />
  );
}

/**
 * Renders either the full dashboard top bar or a standalone theme toggle,
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
    return <DashboardTopHeaderBar />;
  }

  return (
    <div className="fixed top-4 right-6 z-50">
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
        {mounted && isDark ? (
          <Sun className="size-4" />
        ) : (
          <Moon className="size-4" />
        )}
      </button>
    </div>
  );
}
