"use client";

import { DashboardTopBar } from "@/app/dashboard/components/DashboardTopBar";
import { Moon, Sun } from "lucide-react";
import { ThemeProvider, useTheme } from "next-themes";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";

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
  const dashboardView = searchParams?.get("view") || "dashboard";
  const nextTheme = isDark ? "light" : "dark";

  if (isDashboardRoute && dashboardView === "dashboard") {
    return <DashboardTopBar />;
  }

  return (
    <div className="fixed right-6 top-4 z-50">
      <button
        type="button"
        onClick={() => setTheme(nextTheme)}
        aria-label={`Switch to ${nextTheme} mode`}
        className="transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-zinc-600 hover:text-zinc-300"
      >
        {mounted && isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
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
