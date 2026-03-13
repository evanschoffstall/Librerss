"use client";

import { Moon, Sun } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { ThemeProvider, useTheme } from "next-themes";
import { type ReactNode, Suspense, useEffect, useState } from "react";
import { Toaster } from "sonner";

import { DashboardTopHeaderBar } from "@/app/dashboard/components/DashboardTopHeaderBar";

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

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dashboardView = searchParams.get("view") ?? "dashboard";
  const shouldOffsetForDashboardBar =
    pathname === "/dashboard" && dashboardView === "dashboard";

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
      offset={
        shouldOffsetForDashboardBar
          ? { right: "1rem", top: "4.25rem" }
          : { right: "1rem", top: "1rem" }
      }
      position="top-right"
      richColors
      theme={resolvedTheme === "dark" ? "dark" : "light"}
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
    <div className="fixed right-6 top-4 z-50">
      <button
        aria-label={`Switch to ${nextTheme} mode`}
        className="text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => {
          setTheme(nextTheme);
        }}
        type="button"
      >
        {mounted && isDark ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
